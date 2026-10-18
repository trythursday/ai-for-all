import type { Context } from "hono";
import { generateChallenge } from "capjs-core";

import type { Config } from "../config";
import { RateLimiterFactory } from "../rate-limiter";
import type { ChallengeResponse, ResponseShape } from "../utils/mod";

async function issueChallengeHandler(c: Context, config: Config) {
  const result = await generateChallenge(config.secret, {
    challengeCount: config.challenge.count,
    challengeSize: config.challenge.size,
    challengeDifficulty: config.challenge.difficulty,
  });

  if (!("challenge" in result)) {
    throw new Error("unexpected challenge format");
  }

  const body: ResponseShape<ChallengeResponse> = {
    ok: true,
    message: "challenge issued",
    payload: { challenge: result.challenge, token: result.token },
  };

  return c.json(body);
}

export const IssueChallengeRoute = (config: Config) =>
  [
    "/api/v1/issue/challenge",
    RateLimiterFactory("ip", 60_000, 1),
    (c: Context) => issueChallengeHandler(c, config),
  ] as const;
