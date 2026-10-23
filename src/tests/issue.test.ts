import { describe, expect, it, setSystemTime } from "bun:test";

import { createApp } from "../app";
import { mintId } from "../ids";
import { KEY_TTL_MS } from "../keys";
import {
  CONFIG,
  SECRET,
  challengeFor,
  issue,
  solve,
  solveWrong,
} from "./utils";

describe("issue", () => {
  it("mints a signed 29-char key with expiry headers", async () => {
    const app = createApp(CONFIG);
    const { challenge, token } = await challengeFor(app);
    const solutions = solve(token, challenge.c, challenge.s, challenge.d);

    const { status, headers, body } = await issue(app, { token, solutions });

    expect(status).toBe(201);
    expect(body.ok).toBe(true);
    expect(body.payload!.apiKey).toStartWith("sk-th-");
    expect(body.payload!.apiKey).toHaveLength(29);

    // The header is expires - Date.now(), so a clock tick can shave a few ms.
    const ttl = Number(headers.get("x-key-ttl"));

    expect(Math.abs(ttl - KEY_TTL_MS)).toBeLessThan(1_000);

    expect(Date.parse(headers.get("x-key-expires-at")!)).toBeGreaterThan(
      Date.now(),
    );
  });

  it("logs a salted id instead of the key or ip", async () => {
    const app = createApp(CONFIG);
    const { challenge, token } = await challengeFor(app, "6.6.6.6");
    const lines: string[] = [];
    const log = console.log;

    console.log = (...args: unknown[]) => lines.push(args.join(" "));

    let apiKey: string;

    try {
      const res = await issue(
        app,
        {
          token,
          solutions: solve(token, challenge.c, challenge.s, challenge.d),
        },
        "6.6.6.6",
      );

      apiKey = res.body.payload!.apiKey;
    } finally {
      console.log = log;
    }

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain(`minted id=${mintId(SECRET, apiKey, "6.6.6.6")}`);
    expect(lines[0]).not.toContain(apiKey);
    expect(lines[0]).not.toContain("6.6.6.6");
  });

  it("gives the same id only for the same key and ip", () => {
    const first = mintId(SECRET, "sk-th-a", "1.1.1.1");

    expect(mintId(SECRET, "sk-th-a", "1.1.1.1")).toBe(first);
    expect(mintId(SECRET, "sk-th-a", "2.2.2.2")).not.toBe(first);
    expect(mintId(SECRET, "sk-th-b", "1.1.1.1")).not.toBe(first);
    expect(mintId("other-secret", "sk-th-a", "1.1.1.1")).not.toBe(first);
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
      {
        token,
        solutions: solveWrong(token, challenge.c, challenge.s, challenge.d),
      },
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

  it("limits issuance to one per 10 minutes per ip", async () => {
    const app = createApp(CONFIG);
    const ip = "5.5.5.5";
    const now = Date.now();

    async function mint() {
      const { challenge, token } = await challengeFor(app, ip);

      return issue(
        app,
        {
          token,
          solutions: solve(token, challenge.c, challenge.s, challenge.d),
        },
        ip,
      );
    }

    try {
      expect((await mint()).status).toBe(201);

      // Past the one-a-minute challenge limiter, inside the issue window.
      setSystemTime(new Date(now + 61_000));
      expect((await mint()).status).toBe(429);

      // Past the issue window.
      setSystemTime(new Date(now + 661_000));
      expect((await mint()).status).toBe(201);
    } finally {
      setSystemTime();
    }
  });
});
