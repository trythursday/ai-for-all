import type { Context } from "hono";
import { proxy } from "hono/proxy";

import type { Config } from "../config";
import { isValidKey } from "../keys";
import { RateLimiterFactory } from "../rate-limiter";
import { MODELS, apiError, type ModelName } from "../utils/mod";
import { estimateTokens, pickOpenAiFields } from "../utils/normalize";

function bearer(c: Context) {
  return c.req.header("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
}

async function chatHandler(c: Context, config: Config) {
  if (!isValidKey(bearer(c))) {
    return c.json(
      apiError("Invalid API key.", "invalid_request_error", "invalid_api_key"),
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

  body.max_tokens = Math.min(
    typeof body.max_tokens === "number"
      ? body.max_tokens
      : config.limits.outputTokens,
    config.limits.outputTokens,
    contextRoom,
  );

  return proxy(`${config.upstreamUrl}/chat/completions`, {
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
    RateLimiterFactory("authz", 3_600_000, 60),
    (c: Context) => chatHandler(c, config),
  ] as const;
