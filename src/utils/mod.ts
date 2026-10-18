import type { Context } from "hono";
import * as z from "zod/mini";

export function clientIp(c: Context) {
  return (
    c.req.header("cf-connecting-ip") ??
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

export interface ApiError {
  message: string;
  type: string;
  code: string;
}

export interface ResponseShape<T = unknown> {
  ok: boolean;
  message?: string;
  error?: ApiError;
  payload?: T;
}

export function apiError(message: string, type: string, code: string) {
  return { ok: false, error: { message, type, code } } satisfies ResponseShape;
}

export const MODELS = ["local", "frontier"] as const;

export type ModelName = (typeof MODELS)[number];

export const ChallengeSchema = z.object({
  c: z.number(),
  s: z.number(),
  d: z.number(),
});

export const ChallengeResponseSchema = z.object({
  challenge: ChallengeSchema,
  token: z.string(),
});

export type ChallengeResponse = z.infer<typeof ChallengeResponseSchema>;

export type ConsumeNonce = (
  sig: string,
  ttlMs: number,
) => boolean | Promise<boolean>;

export const IssueRequestSchema = z.object({
  token: z.string(),
  solutions: z.array(z.number()),
});

export type IssueRequest = z.infer<typeof IssueRequestSchema>;

export const KeyUsageSchema = z.object({
  data: z.object({ usage_daily: z.number() }),
});
