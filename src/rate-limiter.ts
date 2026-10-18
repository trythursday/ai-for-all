import type { Context } from "hono";
import { rateLimiter } from "hono-rate-limiter";

import { clientIp } from "./utils/mod";

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
  });
}
