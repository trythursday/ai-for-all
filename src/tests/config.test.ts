import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import process from "node:process";

import {
  DEFAULT_DAILY_BUDGET_USD,
  DEFAULT_MONTHLY_BUDGET_USD,
  loadConfig,
} from "../config";

const REQUIRED = {
  CAP_SECRET: "0123456789abcdef0123456789abcdef",
  UPSTREAM_URL: "https://openrouter.ai/api/v1",
  UPSTREAM_SK: "sk-or-test",
  UPSTREAM_MODEL_LOCAL: "test/local",
  UPSTREAM_MODEL_FRONTIER: "test/frontier",
};

const BUDGET_KEYS = ["DAILY_BUDGET_USD", "MONTHLY_BUDGET_USD"];
const KEYS = [...Object.keys(REQUIRED), ...BUDGET_KEYS];
const saved = new Map(KEYS.map((key) => [key, process.env[key]]));

beforeEach(() => {
  Object.assign(process.env, REQUIRED);

  for (const key of BUDGET_KEYS) delete process.env[key];
});

afterEach(() => {
  for (const [key, value] of saved) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("loadConfig", () => {
  it("defaults the budgets", () => {
    const { budget } = loadConfig();

    expect(budget.dailyUsd).toBe(DEFAULT_DAILY_BUDGET_USD);
    expect(budget.monthlyUsd).toBe(DEFAULT_MONTHLY_BUDGET_USD);
  });

  it("reads the budgets from the environment", () => {
    process.env.DAILY_BUDGET_USD = "1.5";
    process.env.MONTHLY_BUDGET_USD = "20";

    const { budget } = loadConfig();

    expect(budget.dailyUsd).toBe(1.5);
    expect(budget.monthlyUsd).toBe(20);
  });
});
