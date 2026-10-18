import { createHash } from "node:crypto";

import type { createApp } from "../app";
import {
  DEFAULT_DAILY_BUDGET_USD,
  DEFAULT_MONTHLY_BUDGET_USD,
  type Config,
} from "../config";
import type { ChallengeResponse, ResponseShape } from "../utils/mod";

export const SECRET = "0123456789abcdef0123456789abcdef";

export const CONFIG: Config = {
  secret: SECRET,
  upstreamSk: "sk-or-test",
  models: { local: "test/local", frontier: "test/frontier" },
  providers: {
    local: {},
    frontier: {
      quantizations: ["fp8"],
      max_price: { prompt: 0.2, completion: 0.72 },
    },
  },
  // Production runs a deliberately heavy challenge; the tests only care about
  // the flow, so they solve the cheapest one cap.js allows.
  challenge: { count: 1, size: 8, difficulty: 1 },
  limits: {
    inputTokens: 16_384,
    outputTokens: 16_384,
    contextTokens: 32_768,
  },
  budget: {
    dailyUsd: DEFAULT_DAILY_BUDGET_USD,
    monthlyUsd: DEFAULT_MONTHLY_BUDGET_USD,
  },
};

export type App = ReturnType<typeof createApp>;
export type Body = ResponseShape<ChallengeResponse & { apiKey: string }>;

function fnv1a(str: string) {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return hash >>> 0;
}

function fnv1aResume(state: number, str: string) {
  let h = state;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return h >>> 0;
}

function prng(seed: number, length: number) {
  let state = seed;
  let result = "";
  while (result.length < length) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    result += state.toString(16).padStart(8, "0");
  }
  return result.slice(0, length);
}

function digest(input: string) {
  return createHash("sha256").update(input).digest("hex");
}

function challengeForToken(token: string, i: number, s: number, d: number) {
  const saltSeed = fnv1aResume(fnv1a(token), String(i + 1));

  return {
    salt: prng(saltSeed, s),
    target: prng(fnv1aResume(saltSeed, "d"), d),
  };
}

export function solve(token: string, c: number, s: number, d: number) {
  const solutions: number[] = [];

  for (let i = 0; i < c; i++) {
    const { salt, target } = challengeForToken(token, i, s, d);

    let nonce = 0;
    while (!digest(salt + nonce).startsWith(target)) nonce++;

    solutions.push(nonce);
  }

  return solutions;
}

// A well-formed solution that is guaranteed not to verify, unlike a hardcoded
// nonce: at difficulty 1 the real nonce is 0 one time in sixteen.
export function solveWrong(token: string, c: number, s: number, d: number) {
  const solutions: number[] = [];

  for (let i = 0; i < c; i++) {
    const { salt, target } = challengeForToken(token, i, s, d);

    let nonce = 0;
    while (digest(salt + nonce).startsWith(target)) nonce++;

    solutions.push(nonce);
  }

  return solutions;
}

export function post(app: App, path: string, body?: unknown, ip = "1.1.1.1") {
  return app.request(`http://x${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export async function issue(app: App, body: unknown, ip = "1.1.1.1") {
  const res = await post(app, "/api/v1/issue", body, ip);

  return {
    status: res.status,
    headers: res.headers,
    body: (await res.json()) as Body,
  };
}

export async function challengeFor(
  app: App,
  ip = "1.1.1.1",
): Promise<ChallengeResponse> {
  const res = await post(app, "/api/v1/issue/challenge", undefined, ip);
  const body = (await res.json()) as ResponseShape<ChallengeResponse>;

  if (!body.payload) throw new Error("challenge payload missing");

  return body.payload;
}
