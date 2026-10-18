import type { Context } from "hono";
import { validateChallenge } from "capjs-core";

import { mintKey } from "../keys";
import { RateLimiterFactory } from "../rate-limiter";
import {
  IssueRequestSchema,
  apiError,
  type ConsumeNonce,
  type ResponseShape,
} from "../utils/mod";

async function issueTokenHandler(
  c: Context,
  secret: string,
  consumeNonce: ConsumeNonce,
) {
  const parsed = IssueRequestSchema.safeParse(
    await c.req.json().catch(() => null),
  );

  if (!parsed.success) {
    return c.json(
      apiError(
        "expected { token, solutions }",
        "invalid_request_error",
        "invalid_request",
      ),
      400,
    );
  }

  const result = await validateChallenge(secret, parsed.data, { consumeNonce });

  if (!result.success) {
    return c.json(
      apiError(result.reason, "invalid_request_error", result.reason),
      400,
    );
  }

  const { apiKey, expires } = mintKey();

  c.header("X-Key-Expires-At", new Date(expires).toISOString());
  c.header("X-Key-TTL", String(expires - Date.now()));

  const body: ResponseShape<{ apiKey: string }> = {
    ok: true,
    message: "key issued",
    payload: { apiKey },
  };

  return c.json(body, 201);
}

export const IssueTokenRoute = (secret: string, consumeNonce: ConsumeNonce) =>
  [
    "/api/v1/issue",
    RateLimiterFactory("ip", 86_400_000, 1, { skipFailedRequests: true }),
    (c: Context) => issueTokenHandler(c, secret, consumeNonce),
  ] as const;
