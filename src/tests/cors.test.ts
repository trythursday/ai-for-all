import { describe, expect, it } from "bun:test";

import { createApp } from "../app";
import { CONFIG } from "./utils";

describe("cors", () => {
  it("allows any origin on the api", async () => {
    const res = await createApp(CONFIG).request("http://x/api/v1/models", {
      headers: { origin: "https://example.com" },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-expose-headers")).toBe(
      "X-Key-Expires-At,X-Key-TTL",
    );
  });

  it("answers a preflight without spending budget", async () => {
    const res = await createApp(CONFIG).request(
      "http://x/api/v1/chat/completions",
      {
        method: "OPTIONS",
        headers: {
          origin: "https://example.com",
          "access-control-request-method": "POST",
          "access-control-request-headers": "authorization, content-type",
        },
      },
    );

    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-methods")).toContain("POST");
    expect(res.headers.get("access-control-allow-headers")).toBe(
      "authorization,content-type",
    );
  });
});
