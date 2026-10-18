import process from "node:process";

import { afterAll, afterEach, describe, expect, it, setSystemTime } from "bun:test";
import type { Context, Next } from "hono";

import {
  DAILY_REQUEST_FALLBACK,
  HOURLY_REQUEST_CAP,
  budgetBreaker,
  trafficBreaker,
} from "../guard";
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

describe("budgetBreaker", () => {
  it("allows traffic when spend is under budget", async () => {
    process.env.UPSTREAM_SK = "sk-or-test";
    globalThis.fetch = (async () => spendResponse(0.4)) as unknown as typeof fetch;

    const n = next();
    const res = await budgetBreaker(ctx(), n.fn);

    expect(res).toBeUndefined();
    expect(n.called()).toBe(true);
  });

  it("keeps the last known spend when the response cannot be parsed", async () => {
    process.env.UPSTREAM_SK = "sk-or-test";
    setSystemTime(realNow + 61_000);
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ nope: true }), {
        status: 200,
      })) as unknown as typeof fetch;

    const n = next();
    const res = await budgetBreaker(ctx(), n.fn);

    expect(res).toBeUndefined();
    expect(n.called()).toBe(true);
  });

  it("blocks when daily spend reaches the budget", async () => {
    process.env.UPSTREAM_SK = "sk-or-test";
    setSystemTime(realNow + 122_000);
    globalThis.fetch = (async () => spendResponse(2.5)) as unknown as typeof fetch;

    const n = next();
    const res = await budgetBreaker(ctx(), n.fn);

    expect(res?.status).toBe(503);
    expect(n.called()).toBe(false);
    expect(await res?.json()).toMatchObject({ error: { code: "budget_exhausted" } });
  });

  it("keeps the last known spend when the lookup errors", async () => {
    process.env.UPSTREAM_SK = "sk-or-test";
    setSystemTime(realNow + 183_000);
    globalThis.fetch = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;

    const n = next();
    const res = await budgetBreaker(ctx(), n.fn);

    expect(res?.status).toBe(503);
    expect(n.called()).toBe(false);
  });

  it("counts requests when no upstream key is configured", async () => {
    setSystemTime(realNow + 10 * 86_400_000);

    for (let i = 0; i < DAILY_REQUEST_FALLBACK; i++) {
      const n = next();
      const res = await budgetBreaker(ctx(), n.fn);

      expect(res).toBeUndefined();
      expect(n.called()).toBe(true);
    }

    const n = next();
    const res = await budgetBreaker(ctx(), n.fn);

    expect(res?.status).toBe(503);
    expect(n.called()).toBe(false);
  });

  it("resets the fallback counter at utc midnight", async () => {
    setSystemTime(realNow + 86_400_000);

    const n = next();
    const res = await budgetBreaker(ctx(), n.fn);

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
