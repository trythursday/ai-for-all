import process from "node:process";

import { afterAll, afterEach, describe, expect, it, setSystemTime } from "bun:test";
import { Hono } from "hono";
import type { Context, Next } from "hono";

import {
  DAILY_REQUEST_FALLBACK,
  HOURLY_REQUEST_CAP,
  budgetBreaker,
  trafficBreaker,
} from "../guard";
import { DEFAULT_DAILY_BUDGET_USD } from "../config";
import { RateLimiterFactory } from "../rate-limiter";
import { clientIp } from "../utils/mod";

const realNow = Date.now();
const realFetch = globalThis.fetch;

function ctx(headers: Record<string, string> = {}) {
  const lower = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]),
  );

  return {
    req: { header: (name: string) => lower[name.toLowerCase()] },
    json: (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
  } as unknown as Context;
}

function next() {
  let called = false;

  const fn = (async () => {
    called = true;
  }) as unknown as Next;

  return { fn, called: () => called };
}

function spendResponse(usage_daily: number) {
  return new Response(JSON.stringify({ data: { usage_daily } }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  setSystemTime(realNow);
  globalThis.fetch = realFetch;
  delete process.env.UPSTREAM_SK;
});

afterAll(() => {
  setSystemTime();
  globalThis.fetch = realFetch;
});

describe("clientIp", () => {
  it("prefers cf-connecting-ip over x-forwarded-for", () => {
    const ip = clientIp(
      ctx({ "cf-connecting-ip": "1.2.3.4", "x-forwarded-for": "9.9.9.9" }),
    );

    expect(ip).toBe("1.2.3.4");
  });

  it("falls back to the first x-forwarded-for entry", () => {
    const ip = clientIp(ctx({ "x-forwarded-for": "7.7.7.7, 10.0.0.1" }));

    expect(ip).toBe("7.7.7.7");
  });

  it("returns unknown when neither header is present", () => {
    expect(clientIp(ctx())).toBe("unknown");
  });
});

describe("RateLimiterFactory", () => {
  it("answers a blocked request with the API error envelope", async () => {
    setSystemTime(realNow + 30 * 86_400_000);

    const app = new Hono();
    app.get("/x", RateLimiterFactory("ip", 60_000, 1), (c) => c.text("ok"));

    const first = await app.request("http://x/x", {
      headers: { "cf-connecting-ip": "203.0.113.1" },
    });
    expect(first.status).toBe(200);

    const blocked = await app.request("http://x/x", {
      headers: { "cf-connecting-ip": "203.0.113.1" },
    });

    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("content-type")).toContain("application/json");
    expect(await blocked.json()).toMatchObject({
      ok: false,
      error: {
        message: "Too many requests. Try again later.",
        type: "rate_limit_error",
        code: "rate_limit_exceeded",
      },
    });
  });
});

describe("budgetBreaker", () => {
  // The spend cache is module state shared with the other suites, so each test
  // jumps far enough ahead that the previous fetch is always stale.
  it("allows traffic when spend is under budget", async () => {
    setSystemTime(realNow + 20 * 86_400_000);
    globalThis.fetch = (async () =>
      spendResponse(DEFAULT_DAILY_BUDGET_USD / 2)) as unknown as typeof fetch;

    const n = next();
    const res = await budgetBreaker(DEFAULT_DAILY_BUDGET_USD, "sk-or-test")(ctx(), n.fn);

    expect(res).toBeUndefined();
    expect(n.called()).toBe(true);
  });

  it("keeps the last known spend when the response cannot be parsed", async () => {
    setSystemTime(realNow + 21 * 86_400_000);
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ nope: true }), {
        status: 200,
      })) as unknown as typeof fetch;

    const n = next();
    const res = await budgetBreaker(DEFAULT_DAILY_BUDGET_USD, "sk-or-test")(ctx(), n.fn);

    expect(res).toBeUndefined();
    expect(n.called()).toBe(true);
  });

  it("blocks when daily spend reaches the budget", async () => {
    setSystemTime(realNow + 22 * 86_400_000);
    globalThis.fetch = (async () =>
      spendResponse(DEFAULT_DAILY_BUDGET_USD * 2)) as unknown as typeof fetch;

    const n = next();
    const res = await budgetBreaker(DEFAULT_DAILY_BUDGET_USD, "sk-or-test")(ctx(), n.fn);

    expect(res?.status).toBe(503);
    expect(n.called()).toBe(false);
    expect(await res?.json()).toMatchObject({ error: { code: "budget_exhausted" } });
  });

  it("keeps the last known spend when the lookup errors", async () => {
    setSystemTime(realNow + 23 * 86_400_000);
    globalThis.fetch = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;

    const n = next();
    const res = await budgetBreaker(DEFAULT_DAILY_BUDGET_USD, "sk-or-test")(ctx(), n.fn);

    expect(res?.status).toBe(503);
    expect(n.called()).toBe(false);
  });

  it("counts requests when no upstream key is configured", async () => {
    setSystemTime(realNow + 10 * 86_400_000);

    for (let i = 0; i < DAILY_REQUEST_FALLBACK; i++) {
      const n = next();
      const res = await budgetBreaker(DEFAULT_DAILY_BUDGET_USD, "")(ctx(), n.fn);

      expect(res).toBeUndefined();
      expect(n.called()).toBe(true);
    }

    const n = next();
    const res = await budgetBreaker(DEFAULT_DAILY_BUDGET_USD, "")(ctx(), n.fn);

    expect(res?.status).toBe(503);
    expect(n.called()).toBe(false);
  });

  it("resets the fallback counter at utc midnight", async () => {
    setSystemTime(realNow + 30 * 86_400_000);

    const n = next();
    const res = await budgetBreaker(DEFAULT_DAILY_BUDGET_USD, "")(ctx(), n.fn);

    expect(res).toBeUndefined();
    expect(n.called()).toBe(true);
  });
});

describe("trafficBreaker", () => {
  it("allows the cap then blocks, and clears on a new window", async () => {
    setSystemTime(realNow + 3 * 86_400_000);

    for (let i = 0; i < HOURLY_REQUEST_CAP; i++) {
      const n = next();
      const res = await trafficBreaker(ctx(), n.fn);

      expect(res).toBeUndefined();
      expect(n.called()).toBe(true);
    }

    const blocked = next();
    const res = await trafficBreaker(ctx(), blocked.fn);

    expect(res?.status).toBe(503);
    expect(blocked.called()).toBe(false);
    expect(await res?.json()).toMatchObject({ error: { code: "overloaded" } });

    setSystemTime(realNow + 3 * 86_400_000 + 3_600_000 + 1);

    const reopened = next();
    const after = await trafficBreaker(ctx(), reopened.fn);

    expect(after).toBeUndefined();
    expect(reopened.called()).toBe(true);
  });
});
