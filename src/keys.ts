import { randomBytes } from "node:crypto";

export const KEY_TTL_MS = 86_400_000;

const keys = new Map<string, number>();

export function mintKey() {
  const apiKey = `sk-th-${randomBytes(20).toString("base64url").slice(0, 26)}`;
  const expires = Date.now() + KEY_TTL_MS;

  keys.set(apiKey, expires);

  return { apiKey, expires };
}

export type KeyStatus = "valid" | "expired" | "unknown";

export function keyStatus(apiKey: string): KeyStatus {
  const expires = keys.get(apiKey);

  if (expires === undefined) return "unknown";

  if (expires <= Date.now()) {
    keys.delete(apiKey);
    return "expired";
  }

  return "valid";
}
