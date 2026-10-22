import { Hono } from "hono";
import { cors } from "hono/cors";

import type { Config } from "./config";
import { budgetBreaker, trafficBreaker } from "./guard";
import { renderHome } from "./home";
import {
  BalanceRoute,
  ChatRoute,
  IssueChallengeRoute,
  IssueTokenRoute,
  ModelsRoute,
} from "./routes";

const widgets = new Map(
  await Promise.all(
    ["api-key-widget.js", "balance-widget.js"].map(async (name) => [
      `/${name}`,
      await Bun.file(new URL(`./client/${name}`, import.meta.url)).text(),
    ] as const),
  ),
);

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

  // Ahead of the breakers, so a browser preflight is answered without spending
  // traffic or budget on an OPTIONS request.
  app.use(
    "/api/v1/*",
    cors({
      origin: "*",
      exposeHeaders: ["X-Key-Expires-At", "X-Key-TTL"],
    }),
  );

  app.use("/api/v1/*", trafficBreaker);
  // Cached, so it stays readable when the daily budget is spent.
  app.get(...BalanceRoute(config));
  app.use("/api/v1/*", budgetBreaker(config.budget.dailyUsd, config.upstreamSk));

  app.get("/", (c) => c.html(renderHome()));

  for (const [path, source] of widgets) {
    app.get(path, (c) =>
      c.body(source, 200, { "content-type": "text/javascript; charset=utf-8" }),
    );
  }

  app.get(...ModelsRoute());
  app.post(...IssueChallengeRoute(config));
  app.post(...IssueTokenRoute(config.secret, consumeNonce));
  app.post(...ChatRoute(config));

  return app;
}
