import { describe, expect, it } from "bun:test";

import { createApp } from "../app";
import { CONFIG, challengeFor, issue, post, solve } from "./utils";

describe("issue", () => {
  it("mints a 32-char key with expiry headers", async () => {
    const app = createApp(CONFIG);
    const { challenge, token } = await challengeFor(app);
    const solutions = solve(token, challenge.c, challenge.s, challenge.d);

    const { status, headers, body } = await issue(app, { token, solutions });

    expect(status).toBe(201);
    expect(body.ok).toBe(true);
    expect(body.payload!.apiKey).toStartWith("sk-th-");
    expect(body.payload!.apiKey).toHaveLength(32);
    expect(headers.get("x-key-ttl")).toBe("2592000000");
    expect(Date.parse(headers.get("x-key-expires-at")!)).toBeGreaterThan(
      Date.now(),
    );
  });

  it("rejects a replayed challenge", async () => {
    const app = createApp(CONFIG);
    const { challenge, token } = await challengeFor(app);
    const solutions = solve(token, challenge.c, challenge.s, challenge.d);

    await issue(app, { token, solutions }, "2.2.2.2");

    const replay = await issue(app, { token, solutions }, "3.3.3.3");

    expect(replay.status).toBe(400);
    expect(replay.body.error?.code).toBe("already_redeemed");
  });

  it("rejects an invalid body", async () => {
    const app = createApp(CONFIG);

    const { status, body } = await issue(app, { nope: true });

    expect(status).toBe(400);
    expect(body.error?.code).toBe("invalid_request");
  });

  it("does not burn the daily quota on failures", async () => {
    const app = createApp(CONFIG);
    const { challenge, token } = await challengeFor(app, "4.4.4.4");

    const rejected = await issue(
      app,
      { token, solutions: Array(challenge.c).fill(0) },
      "4.4.4.4",
    );
    expect(rejected.body.error?.code).toBe("invalid_solution");

    const retry = await issue(
      app,
      { token, solutions: solve(token, challenge.c, challenge.s, challenge.d) },
      "4.4.4.4",
    );

    expect(retry.status).toBe(201);
  });

  it("limits issuance to one per day per ip", async () => {
    const app = createApp(CONFIG);
    const { challenge, token } = await challengeFor(app, "5.5.5.5");

    await issue(
      app,
      { token, solutions: solve(token, challenge.c, challenge.s, challenge.d) },
      "5.5.5.5",
    );

    const second = await post(
      app,
      "/api/v1/issue/challenge",
      undefined,
      "5.5.5.5",
    );

    expect(second.status).toBe(429);
  });
});
