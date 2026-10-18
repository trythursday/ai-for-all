import {
  afterEach,
  describe,
  expect,
  it,
  setSystemTime,
} from "bun:test";

import { BALANCE_CACHE_MS } from "../balance";
import { createApp } from "../app";
import { CONFIG } from "./utils";

const realFetch = globalThis.fetch;
const realNow = Date.now();

afterEach(() => {
  globalThis.fetch = realFetch;
  setSystemTime();
});

function balanceResponse(limit_remaining: number) {
  return new Response(JSON.stringify({ data: { limit_remaining } }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("balance", () => {
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

  it("reports the remaining balance and caches it", async () => {
    setSystemTime(realNow + 1_000);

    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return balanceResponse(4.25);
    }) as unknown as typeof fetch;

    const app = createApp(CONFIG);

    const first = await app.request("http://x/api/v1/balance");

    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({
      ok: true,
      payload: {
        remainingUsd: 4.25,
        updatedAt: new Date(realNow + 1_000).toISOString(),
      },
    });

    const second = await app.request("http://x/api/v1/balance");

    expect(second.status).toBe(200);
    expect(calls).toBe(1);
  });

  it("refreshes the cache after five minutes", async () => {
    setSystemTime(realNow + BALANCE_CACHE_MS + 2_000);

    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return balanceResponse(3.5);
    }) as unknown as typeof fetch;

    const app = createApp(CONFIG);
    const res = await app.request("http://x/api/v1/balance");

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ payload: { remainingUsd: 3.5 } });
    expect(calls).toBe(1);
  });
});
