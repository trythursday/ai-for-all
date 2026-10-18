import { Hono } from "hono";

import type { Config } from "./config";
import { budgetBreaker, trafficBreaker } from "./guard";
import { renderHome } from "./home";
import {
  ChatRoute,
  IssueChallengeRoute,
  IssueTokenRoute,
  ModelsRoute,
} from "./routes";

export function createApp(config: Config) {
  const app = new Hono();

  const nonces = new Map<string, number>();

  const consumeNonce = (sig: string, ttlMs: number) => {
    const expiresAt = nonces.get(sig);
    if (expiresAt !== undefined && expiresAt > Date.now()) {
      return false;
    }
    nonces.set(sig, Date.now() + ttlMs);
    return true;
  };

  app.use("/api/v1/*", trafficBreaker);
  app.use("/api/v1/*", budgetBreaker);

  app.get("/", (c) => c.html(renderHome()));
  app.get(...ModelsRoute());
  app.post(...IssueChallengeRoute(config));
  app.post(...IssueTokenRoute(config.secret, consumeNonce));
  app.post(...ChatRoute(config));

  return app;
}
