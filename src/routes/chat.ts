import type { Context } from "hono";
import { proxy } from "hono/proxy";

import { OPENROUTER_URL, type Config } from "../config";
import { keyId } from "../ids";
import { KEY_TTL_MS, keyStatus } from "../keys";
import { RateLimiterFactory } from "../rate-limiter";
import { MODELS, apiError, type ModelName } from "../utils/mod";
import { estimateTokens, pickOpenAiFields } from "../utils/normalize";

// The daily budget is shared by everyone, so one ip must not be able to spend
// it alone. At 15 an hour an ip stays a fair share of a 0.25 day. Keys are
// disposable, so the ip is what gets counted; the key limiter is a backstop.
const REQUESTS_PER_HOUR = 15;

// Reasoning models spend their output budget thinking before they emit any
// content, so a tiny max_tokens produces an empty message with
// finish_reason: "length". Reserve room for an actual answer.
const MIN_OUTPUT_TOKENS = 1_024;

// OpenRouter caps reasoning per request. A quarter of the budget keeps the
// default at 2048 while always leaving the rest for visible output.
const MAX_REASONING_TOKENS = 2_048;

function bearer(c: Context) {
  return c.req.header("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
}

async function chatHandler(c: Context, config: Config) {
  const apiKey = bearer(c);
  const status = keyStatus(apiKey);

  if (status !== "valid") {
    const home = new URL(c.req.url).origin;
    const expired = status === "expired";
    const hours = KEY_TTL_MS / 3_600_000;

    return c.json(
      apiError(
        expired
          ? `Your API key expired. Keys last ${hours} hours; get a new one at ${home} and try again.`
          : `That API key is not valid. Get a free one at ${home}.`,
        "invalid_request_error",
        expired ? "key_expired" : "invalid_api_key",
      ),
      401,
    );
  }

  const raw = (await c.req.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;

  if (!raw || !Array.isArray(raw.messages)) {
    return c.json(
      apiError(
        "Expected a messages array.",
        "invalid_request_error",
        "invalid_request",
      ),
      400,
    );
  }

  const requested = (raw.model ?? "local") as ModelName;

  if (!MODELS.includes(requested)) {
    return c.json(
      apiError(
        `Unknown model. Use one of: ${MODELS.join(", ")}.`,
        "invalid_request_error",
        "invalid_model",
      ),
      400,
    );
  }

  const body = pickOpenAiFields(raw);
  const inputTokens = estimateTokens(raw.messages);
  const contextRoom = config.limits.contextTokens - inputTokens;

  if (inputTokens > config.limits.inputTokens || contextRoom < 1) {
    return c.json(
      apiError(
        `Input is too long. Estimated ${inputTokens} tokens, limit ${config.limits.inputTokens}.`,
        "invalid_request_error",
        "context_length_exceeded",
      ),
      400,
    );
  }

  body.model = config.models[requested];

  const prefs = config.providers[requested];

  if (prefs && Object.keys(prefs).length > 0) {
    body.provider = prefs;
  }

  const requestedTokens =
    typeof body.max_tokens === "number"
      ? body.max_tokens
      : config.limits.outputTokens;

  const outputTokens = Math.min(
    Math.max(requestedTokens, MIN_OUTPUT_TOKENS),
    config.limits.outputTokens,
    contextRoom,
  );

  body.max_tokens = outputTokens;

  body.reasoning = {
    max_tokens: Math.min(MAX_REASONING_TOKENS, Math.floor(outputTokens / 4)),
  };

  // Without this, every request shares one account-level upstream identity and
  // a provider block for one user's spam would land on all of them.
  body.user = keyId(config.secret, apiKey);

  return proxy(`${OPENROUTER_URL}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.upstreamSk}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

export const ChatRoute = (config: Config) =>
  [
    "/api/v1/chat/completions",
    RateLimiterFactory("ip", 3_600_000, REQUESTS_PER_HOUR),
    RateLimiterFactory("authz", 3_600_000, REQUESTS_PER_HOUR),
    (c: Context) => chatHandler(c, config),
  ] as const;
