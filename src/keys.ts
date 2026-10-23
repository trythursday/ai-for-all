import { createHmac, timingSafeEqual } from "node:crypto";

export const KEY_TTL_MS = 86_400_000;

const PREFIX = "sk-th-";

// base36 seconds, which stays seven chars past 2100.
const EXPIRY_CHARS = 7;

// 96 bits of HMAC. Enough that forging an expiry is not the cheapest way in.
const SIG_CHARS = 16;

function sign(secret: string, expiry: string) {
  return createHmac("sha256", secret)
    .update(expiry)
    .digest("base64url")
    .slice(0, SIG_CHARS);
}

// Nothing is stored, so a deploy cannot invalidate a key. The expiry is inside
// the key and the signature covers it, so a holder cannot extend one.
export function mintKey(secret: string) {
  const expires = Math.floor((Date.now() + KEY_TTL_MS) / 1_000) * 1_000;
  const expiry = (expires / 1_000).toString(36).padStart(EXPIRY_CHARS, "0");

  return { apiKey: `${PREFIX}${expiry}${sign(secret, expiry)}`, expires };
}

export type KeyStatus = "valid" | "expired" | "unknown";

export function keyStatus(secret: string, apiKey: string): KeyStatus {
  if (!apiKey.startsWith(PREFIX)) return "unknown";

  const body = apiKey.slice(PREFIX.length);

  if (body.length !== EXPIRY_CHARS + SIG_CHARS) return "unknown";

  const expiry = body.slice(0, EXPIRY_CHARS);
  const presented = Buffer.from(body.slice(EXPIRY_CHARS));

  if (!timingSafeEqual(presented, Buffer.from(sign(secret, expiry)))) {
    return "unknown";
  }

  const seconds = Number.parseInt(expiry, 36);

  if (!Number.isSafeInteger(seconds)) return "unknown";

  return seconds * 1_000 <= Date.now() ? "expired" : "valid";
}
