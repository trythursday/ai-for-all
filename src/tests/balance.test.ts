import {
  afterEach,
  describe,
  expect,
  it,
  setSystemTime,
} from "bun:test";

import { BALANCE_CACHE_MS, budgetStatus } from "../balance";
import { createApp } from "../app";
import { CONFIG } from "./utils";

const realFetch = globalThis.fetch;
const realNow = Date.now();

afterEach(() => {
  globalThis.fetch = realFetch;
  setSystemTime();
});

function keyResponse(limit_remaining: number, usage_daily: number) {
  return new Response(JSON.stringify({ data: { limit_remaining, usage_daily } }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("budgetStatus", () => {
  it("reports both budgets as percentages to two decimals", () => {
    const status = budgetStatus(
      0.125,
      { remainingUsd: 3.5, updatedAt: "then" },
      0.25,
      5,
    );

    expect(status).toEqual({
      dailyUsedPercent: 50,
      monthlyRemainingPercent: 70,
      updatedAt: "then",
    });
  });

  it("rounds and clamps", () => {
    const third = budgetStatus(
      0.0833,
      { remainingUsd: 1, updatedAt: "then" },
      0.25,
      3,
    );

    expect(third.dailyUsedPercent).toBe(33.32);
    expect(third.monthlyRemainingPercent).toBe(33.33);

    const over = budgetStatus(
      1,
      { remainingUsd: 9, updatedAt: "then" },
      0.25,
      5,
    );

    expect(over.dailyUsedPercent).toBe(100);
    expect(over.monthlyRemainingPercent).toBe(100);
  });
});

describe("balance route", () => {
  it("answers 503 when the balance cannot be read", async () => {
    globalThis.fetch = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;

    const res = await createApp(CONFIG).request("http://x/api/v1/balance");

    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({
      error: { code: "balance_unavailable" },
    });
  });

  it("reports the budget percentages and caches them", async () => {
    setSystemTime(realNow + 1_000);

    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return keyResponse(4.25, 0.05);
    }) as unknown as typeof fetch;

    const app = createApp(CONFIG);

    const first = await app.request("http://x/api/v1/balance");

    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({
      ok: true,
      payload: {
        dailyUsedPercent: 20,
        monthlyRemainingPercent: 85,
        updatedAt: new Date(realNow + 1_000).toISOString(),
      },
    });

    const second = await app.request("http://x/api/v1/balance");

    expect(second.status).toBe(200);
    expect(calls).toBe(2);
  });

  it("refreshes the balance after five minutes", async () => {
    setSystemTime(realNow + BALANCE_CACHE_MS + 2_000);

    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return keyResponse(3.5, 0.125);
    }) as unknown as typeof fetch;

    const app = createApp(CONFIG);
    const res = await app.request("http://x/api/v1/balance");

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      payload: { monthlyRemainingPercent: 70 },
    });
    expect(calls).toBeGreaterThan(0);
  });
});
