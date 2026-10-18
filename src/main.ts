import process from "node:process";
import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

import { createApp } from "./app";
import { loadConfig } from "./config";

function generateSecret(path: string, force: boolean) {
  if (existsSync(path) && !force) {
    console.error(`${path} already exists. Pass --force to rotate.`);
    process.exit(1);
  }

  const secret = randomBytes(32).toString("base64url");
  writeFileSync(path, `CAP_SECRET=${secret}\n`, { mode: 0o600 });
  process.exit(0);
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      generate: { type: "string" },
      force: { type: "boolean" },
    },
  });

  if (values.force && !values.generate) {
    console.error("--force requires --generate.");
    process.exit(1);
  }

  if (values.generate) {
    generateSecret(values.generate, Boolean(values.force));
  }

  const config = loadConfig();

  Bun.serve({
    port: Number(process.env.PORT ?? 3000),
    fetch: createApp(config).fetch,
  });
}
