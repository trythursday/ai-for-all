import type { Context } from "hono";

import {
  type BudgetStatus,
  budgetStatus,
  openrouterBalance,
} from "../balance";
import type { Config } from "../config";
import { dailySpend } from "../guard";
import { apiError, type ResponseShape } from "../utils/mod";

async function balanceHandler(c: Context, config: Config) {
  const [balance, spent] = await Promise.all([
    openrouterBalance(config.upstreamSk),
    dailySpend(config.upstreamSk),
  ]);

  if (balance === null || spent === null) {
    return c.json(
      apiError(
        "Balance is unavailable.",
        "server_error",
        "balance_unavailable",
      ),
      503,
    );
  }

  const body: ResponseShape<BudgetStatus> = {
    ok: true,
    message: "balance",
    payload: budgetStatus(
      spent,
      balance,
      config.budget.dailyUsd,
      config.budget.monthlyUsd,
    ),
  };

  return c.json(body);
}

export const BalanceRoute = (config: Config) =>
  ["/api/v1/balance", (c: Context) => balanceHandler(c, config)] as const;
