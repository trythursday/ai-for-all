import { afterEach, describe, expect, it, setSystemTime } from "bun:test";

import { createApp } from "../app";
import { keyId } from "../ids";
import { mintKey } from "../keys";
import { CONFIG } from "./utils";

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
  setSystemTime();
});

function chat(
  app: ReturnType<typeof createApp>,
  body: unknown,
  authorization = `Bearer ${mintKey().apiKey}`,
) {
  return app.request("http://x/api/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization },
    body: JSON.stringify(body),
  });
}

function stubUpstream() {
  const seen: { url: string; body: any; auth: string | null }[] = [];

  globalThis.fetch = (async (request: Request) => {
    seen.push({
      url: request.url,
      body: JSON.parse(await request.text()),
      auth: request.headers.get("authorization"),
    });

    return new Response(
      JSON.stringify({ choices: [{ message: { content: "hi" } }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as unknown as typeof fetch;

  return seen;
}

describe("chat", () => {
  it("rejects a missing key", async () => {
    const app = createApp(CONFIG);
    const res = await chat(app, { messages: [] }, "");

    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({
      ok: false,
      error: { code: "invalid_api_key" },
    });
  });

  it("tells a human when the key expired", async () => {
    const app = createApp(CONFIG);
    const { apiKey } = mintKey();

    setSystemTime(new Date(Date.now() + 86_400_001));

    const res = await chat(app, { messages: [] }, `Bearer ${apiKey}`);

    expect(res.status).toBe(401);

    const body = (await res.json()) as {
      error: { code: string; message: string };
    };

    expect(body.error.code).toBe("key_expired");
    expect(body.error.message).toContain("expired");
    expect(body.error.message).toContain("http://x");
  });

  it("rejects an unknown key with a way to get one", async () => {
    const app = createApp(CONFIG);
    const res = await chat(app, { messages: [] }, "Bearer sk-th-nope");

    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({
      error: { code: "invalid_api_key" },
    });
  });

  it("rejects an unknown model", async () => {
    const app = createApp(CONFIG);
    const res = await chat(app, { model: "gpt-9", messages: [] });

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      error: { code: "invalid_model" },
    });
  });

  it("rejects a body without messages", async () => {
    const app = createApp(CONFIG);
    const res = await chat(app, { model: "local" });

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      error: { code: "invalid_request" },
    });
  });

  it("defaults to local and swaps in the upstream model", async () => {
    const seen = stubUpstream();
    const app = createApp(CONFIG);

    const res = await chat(app, { messages: [{ role: "user", content: "hi" }] });

    expect(res.status).toBe(200);
    expect(seen[0]?.url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(seen[0]?.body.model).toBe(CONFIG.models.local);
    expect(seen[0]?.auth).toBe(`Bearer ${CONFIG.upstreamSk}`);
  });

  it("maps the frontier alias", async () => {
    const seen = stubUpstream();
    const app = createApp(CONFIG);

    await chat(app, { model: "frontier", messages: [] });

    expect(seen[0]?.body.model).toBe(CONFIG.models.frontier);
  });

  it("clamps max_tokens", async () => {
    const seen = stubUpstream();
    const app = createApp(CONFIG);

    await chat(app, { messages: [], max_tokens: 999_999 });

    expect(seen[0]?.body.max_tokens).toBe(CONFIG.limits.outputTokens);
  });

  it("fills in max_tokens when omitted", async () => {
    const seen = stubUpstream();
    const app = createApp(CONFIG);

    await chat(app, { messages: [] });

    expect(seen[0]?.body.max_tokens).toBe(CONFIG.limits.outputTokens);
  });

  it("raises a small max_tokens to the floor", async () => {
    const seen = stubUpstream();
    const app = createApp(CONFIG);

    await chat(app, { messages: [], max_tokens: 100 });

    expect(seen[0]?.body.max_tokens).toBe(1_024);
  });

  it("keeps a max_tokens above the floor", async () => {
    const seen = stubUpstream();
    const app = createApp(CONFIG);

    await chat(app, { messages: [], max_tokens: 2_000 });

    expect(seen[0]?.body.max_tokens).toBe(2_000);
  });

  it("caps reasoning when the upstream is openrouter", async () => {
    const seen = stubUpstream();
    const app = createApp(CONFIG);

    await chat(app, { messages: [] });

    expect(seen[0]?.body.reasoning).toEqual({ max_tokens: 2_048 });
  });

  it("sends a stable user id derived from the key", async () => {
    const seen = stubUpstream();
    const app = createApp(CONFIG);
    const { apiKey } = mintKey();
    const authorization = `Bearer ${apiKey}`;

    await chat(app, { messages: [] }, authorization);
    await chat(app, { messages: [] }, authorization);

    const expected = keyId(CONFIG.secret, apiKey);

    expect(seen[0]?.body.user).toBe(expected);
    expect(seen[1]?.body.user).toBe(expected);
    expect(expected).not.toContain(apiKey);
  });

  it("ignores a client-supplied user", async () => {
    const seen = stubUpstream();
    const app = createApp(CONFIG);
    const { apiKey } = mintKey();

    await chat(
      app,
      { messages: [], user: "someone-else" },
      `Bearer ${apiKey}`,
    );

    expect(seen[0]?.body.user).toBe(keyId(CONFIG.secret, apiKey));
  });

  it("rejects input over the input cap", async () => {
    const app = createApp(CONFIG);
    const content = "x".repeat(CONFIG.limits.inputTokens * 4);

    const res = await chat(app, { messages: [{ role: "user", content }] });

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      error: { code: "context_length_exceeded" },
    });
  });

  it("clamps output to the remaining context", async () => {
    const seen = stubUpstream();
    const app = createApp({
      ...CONFIG,
      limits: { ...CONFIG.limits, contextTokens: 10_000 },
    });
    const content = "x".repeat(8_000);

    await chat(app, { messages: [{ role: "user", content }], max_tokens: 16_000 });

    const estimated = Math.ceil(
      JSON.stringify([{ role: "user", content }]).length / 4,
    );
    expect(seen[0]?.body.max_tokens).toBe(10_000 - estimated);
  });

  it("passes tools through untouched", async () => {
    const seen = stubUpstream();
    const app = createApp(CONFIG);
    const tools = [{ type: "function", function: { name: "x" } }];

    await chat(app, { messages: [], tools });

    expect(seen[0]?.body.tools).toEqual(tools);
  });

  it("drops fields a client tries to smuggle to the upstream", async () => {
    const seen = stubUpstream();
    const app = createApp(CONFIG);

    await chat(app, {
      messages: [],
      provider: { sort: "throughput" },
      models: ["some/other-model"],
      transforms: ["middle-out"],
      route: "fallback",
      plugins: [],
    });

    expect(seen[0]?.body.models).toBeUndefined();
    expect(seen[0]?.body.transforms).toBeUndefined();
    expect(seen[0]?.body.route).toBeUndefined();
    expect(seen[0]?.body.plugins).toBeUndefined();
  });

  it("applies the frontier routing prefs, overriding a client provider", async () => {
    const seen = stubUpstream();
    const app = createApp(CONFIG);

    await chat(app, {
      model: "frontier",
      messages: [],
      provider: { sort: "throughput", max_price: { prompt: 99, completion: 99 } },
    });

    expect(seen[0]?.body.provider).toEqual(CONFIG.providers.frontier);
  });

  it("sends no provider prefs for local", async () => {
    const seen = stubUpstream();
    const app = createApp(CONFIG);

    await chat(app, { model: "local", messages: [] });

    expect(seen[0]?.body.provider).toBeUndefined();
  });

  it("limits a key to 25 requests an hour", async () => {
    stubUpstream();
    const app = createApp(CONFIG);
    const authorization = `Bearer ${mintKey().apiKey}`;

    for (let i = 0; i < 25; i++) {
      const res = await chat(app, { messages: [] }, authorization);

      expect(res.status).toBe(200);
    }

    const blocked = await chat(app, { messages: [] }, authorization);

    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toMatchObject({
      error: { code: "rate_limit_exceeded" },
    });
  });
});

describe("models", () => {
  it("lists the aliases", async () => {
    const app = createApp(CONFIG);
    const res = await app.request("http://x/api/v1/models");

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      object: "list",
      data: [{ id: "local" }, { id: "frontier" }],
    });
  });
});
