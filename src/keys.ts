import { randomBytes } from "node:crypto";

export const KEY_TTL_MS = 30 * 86_400_000;

const keys = new Map<string, number>();

export function mintKey() {
  const apiKey = `sk-th-${randomBytes(20).toString("base64url").slice(0, 26)}`;
  const expires = Date.now() + KEY_TTL_MS;

  keys.set(apiKey, expires);

  return { apiKey, expires };
}

export function isValidKey(apiKey: string) {
  const expires = keys.get(apiKey);

  if (expires === undefined) return false;
  if (expires <= Date.now()) {
    keys.delete(apiKey);
    return false;
  }

  return true;
}
