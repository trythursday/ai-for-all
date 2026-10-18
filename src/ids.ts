import { createHmac } from "node:crypto";

function id(secret: string, value: string) {
  return createHmac("sha256", secret).update(value).digest("hex").slice(0, 16);
}

// Stable per-key id, sent upstream as `user` so a provider block lands on one
// end-user instead of the whole account. The ip is deliberately left out:
// networks change, and this has to stay the same across a session.
export function keyId(secret: string, apiKey: string) {
  return id(secret, apiKey);
}

// One key from one ip, for the mint log. Neither value is written out.
export function mintId(secret: string, apiKey: string, ip: string) {
  return id(secret, `${apiKey}:${ip}`);
}
