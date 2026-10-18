import type { Context } from "hono";
import { rateLimiter } from "hono-rate-limiter";

import { apiError, clientIp } from "./utils/mod";

export type KeyBy = "ip" | "authz";

export function RateLimiterFactory(
  keyBy: KeyBy,
  window: number,
  maxUses: number,
  opts: { skipFailedRequests?: boolean } = {},
) {
  return rateLimiter({
    windowMs: window,
    limit: maxUses,
    skipFailedRequests: opts.skipFailedRequests,
    keyGenerator: (c: Context) => {
      if (keyBy === "ip") {
        return clientIp(c);
      }

      return (
        c.req.header("authorization")?.replace(/^Bearer\s+/i, "") ?? "unknown"
      );
    },
    // The library defaults to a text/plain body, which OpenAI clients cannot
    // parse, so return the same envelope as every other error.
    handler: (c: Context) =>
      c.json(
        apiError(
          "Too many requests. Try again later.",
          "rate_limit_error",
          "rate_limit_exceeded",
        ),
        429,
      ),
  });
}
