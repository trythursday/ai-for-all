import process from "node:process";

export interface ProviderPrefs {
  quantizations?: string[];
  max_price?: { prompt: number; completion: number };
}

export interface Config {
  secret: string;
  upstreamUrl: string;
  upstreamSk: string;
  openrouter: boolean;
  models: Record<string, string>;
  providers: Record<string, ProviderPrefs>;
  challenge: {
    count: number;
    size: number;
    difficulty: number;
  };
  limits: {
    inputTokens: number;
    outputTokens: number;
    contextTokens: number;
  };
}

const REQUIRED = [
  "CAP_SECRET",
  "UPSTREAM_URL",
  "UPSTREAM_SK",
  "UPSTREAM_MODEL_LOCAL",
  "UPSTREAM_MODEL_FRONTIER",
] as const;

const DEFAULTS = {
  CHALLENGE_COUNT: 100,
  CHALLENGE_SIZE: 32,
  CHALLENGE_DIFFICULTY: 4,
  MAX_INPUT_TOKENS: 16_384,
  MAX_OUTPUT_TOKENS: 16_384,
  MAX_CONTEXT_TOKENS: 32_768,
} as const;

function envInt(name: keyof typeof DEFAULTS) {
  const raw = process.env[name];

  if (raw === undefined) return DEFAULTS[name];

  const value = Number(raw);

  if (!Number.isInteger(value) || value < 1) {
    console.error(`${name} must be a positive integer, got: ${raw}`);
    process.exit(1);
  }

  return value;
}

export function loadConfig(): Config {
  const missing = REQUIRED.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error(`missing required config: ${missing.join(", ")}`);
    process.exit(1);
  }

  return {
    secret: process.env.CAP_SECRET!,
    upstreamUrl: process.env.UPSTREAM_URL!,
    upstreamSk: process.env.UPSTREAM_SK!,
    openrouter: new URL(process.env.UPSTREAM_URL!).hostname.includes(
      "openrouter",
    ),
    models: {
      local: process.env.UPSTREAM_MODEL_LOCAL!,
      frontier: process.env.UPSTREAM_MODEL_FRONTIER!,
    },
    // p50 across the fp8 endpoints, so the cap keeps roughly the cheaper half
    // without falling back to the fp4 quantizations.
    providers: {
      local: {},
      frontier: {
        quantizations: ["fp8"],
        max_price: { prompt: 0.2, completion: 0.72 },
      },
    },
    challenge: {
      count: envInt("CHALLENGE_COUNT"),
      size: envInt("CHALLENGE_SIZE"),
      difficulty: envInt("CHALLENGE_DIFFICULTY"),
    },
    limits: {
      inputTokens: envInt("MAX_INPUT_TOKENS"),
      outputTokens: envInt("MAX_OUTPUT_TOKENS"),
      contextTokens: envInt("MAX_CONTEXT_TOKENS"),
    },
  };
}
