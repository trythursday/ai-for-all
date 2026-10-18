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

const widget = await Bun.file(
  new URL("./client/widget.js", import.meta.url),
).text();

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
  app.get("/widget.js", (c) =>
    c.body(widget, 200, {
      "content-type": "text/javascript; charset=utf-8",
    }),
  );
  app.get(...ModelsRoute());
  app.post(...IssueChallengeRoute(config));
  app.post(...IssueTokenRoute(config.secret, consumeNonce));
  app.post(...ChatRoute(config));

  return app;
}
