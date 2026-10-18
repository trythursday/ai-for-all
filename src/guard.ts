import process from "node:process";

import type { Context, Next } from "hono";

import { KeyUsageSchema, apiError } from "./utils/mod";

export const HOURLY_WINDOW_MS = 3_600_000;

export const HOURLY_REQUEST_CAP = 2_000;

export const DAILY_BUDGET_USD = 2;

export const DAILY_REQUEST_FALLBACK = 1_000;

export const SPEND_URL = "https://openrouter.ai/api/v1/key";

export const SPEND_CACHE_MS = 60_000;

let windowStart = Date.now();
let windowCount = 0;

export async function trafficBreaker(c: Context, next: Next) {
  const now = Date.now();

  if (now - windowStart >= HOURLY_WINDOW_MS) {
    windowStart = now;
    windowCount = 0;
  }

  windowCount++;

  if (windowCount > HOURLY_REQUEST_CAP) {
    return c.json(
      apiError(
        "Traffic is above capacity right now. Try again later.",
        "server_error",
        "overloaded",
      ),
      503,
    );
  }

  return next();
}

let spendAt = 0;
let spendUsd: number | null = null;

async function dailySpend(): Promise<number | null> {
  const token = process.env.UPSTREAM_SK;

  if (!token) return null;
  if (Date.now() - spendAt < SPEND_CACHE_MS) return spendUsd;

  try {
    const res = await fetch(SPEND_URL, {
      headers: { authorization: `Bearer ${token}` },
    });

    if (!res.ok) return spendUsd;

    const parsed = KeyUsageSchema.safeParse(await res.json());

    if (!parsed.success) return spendUsd;

    spendAt = Date.now();
    spendUsd = parsed.data.data.usage_daily;
  } catch {
    return spendUsd;
  }

  return spendUsd;
}

function utcDay() {
  const now = new Date();

  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

let requestDay = utcDay();
let requestCount = 0;

function fallbackExhausted() {
  const today = utcDay();

  if (today !== requestDay) {
    requestDay = today;
    requestCount = 0;
  }

  return ++requestCount > DAILY_REQUEST_FALLBACK;
}

export async function budgetBreaker(c: Context, next: Next) {
  const spend = await dailySpend();
  const exhausted =
    spend === null ? fallbackExhausted() : spend >= DAILY_BUDGET_USD;

  if (exhausted) {
    return c.json(
      apiError(
        "The daily budget is spent. Try again tomorrow.",
        "server_error",
        "budget_exhausted",
      ),
      503,
    );
  }

  return next();
}
