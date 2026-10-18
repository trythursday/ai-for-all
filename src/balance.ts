import * as z from "zod/mini";

export const BALANCE_URL = "https://openrouter.ai/api/v1/key";

export const BALANCE_CACHE_MS = 300_000;

export interface Balance {
  remainingUsd: number;
  updatedAt: string;
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
