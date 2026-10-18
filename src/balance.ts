import * as z from "zod/mini";

import { OPENROUTER_URL } from "./config";

export const BALANCE_URL = `${OPENROUTER_URL}/key`;

export const BALANCE_CACHE_MS = 300_000;

export interface Balance {
  remainingUsd: number;
  updatedAt: string;
}

export interface BudgetStatus {
  dailyUsedPercent: number;
  monthlyRemainingPercent: number;
  updatedAt: string;
}

// Rounded to two decimals and clamped, so the page never shows a negative
// balance or a value the breaker has already stopped acting on.
function percent(part: number, whole: number) {
  if (whole <= 0) return 0;

  return Math.min(100, Math.max(0, Math.round((part / whole) * 10_000) / 100));
}

export function budgetStatus(
  dailySpentUsd: number,
  balance: Balance,
  dailyBudgetUsd: number,
  monthlyBudgetUsd: number,
): BudgetStatus {
  return {
    dailyUsedPercent: percent(dailySpentUsd, dailyBudgetUsd),
    monthlyRemainingPercent: percent(balance.remainingUsd, monthlyBudgetUsd),
    updatedAt: balance.updatedAt,
  };
}

const KeyBalanceSchema = z.object({
  data: z.object({
    limit_remaining: z.optional(z.nullable(z.number())),
  }),
});

let fetchedAt = 0;
let cached: Balance | null = null;

export async function openrouterBalance(token: string): Promise<Balance | null> {
  if (Date.now() - fetchedAt < BALANCE_CACHE_MS) return cached;

  try {
    const res = await fetch(BALANCE_URL, {
      headers: { authorization: `Bearer ${token}` },
    });

    if (!res.ok) return cached;

    const parsed = KeyBalanceSchema.safeParse(await res.json());

    if (!parsed.success) return cached;

    const remaining = parsed.data.data.limit_remaining;

    if (typeof remaining !== "number") return cached;

    fetchedAt = Date.now();
    cached = {
      remainingUsd: remaining,
      updatedAt: new Date(fetchedAt).toISOString(),
    };
  } catch {
    return cached;
  }

  return cached;
}
