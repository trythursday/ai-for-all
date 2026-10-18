import type { Context } from "hono";

import { type Balance, openrouterBalance } from "../balance";
import { apiError, type ResponseShape } from "../utils/mod";

async function balanceHandler(c: Context, token: string) {
  const balance = await openrouterBalance(token);

  if (balance === null) {
    return c.json(
      apiError(
        "Balance is unavailable.",
        "server_error",
        "balance_unavailable",
      ),
      503,
    );
  }

  const body: ResponseShape<Balance> = {
    ok: true,
    message: "balance",
    payload: balance,
  };

  return c.json(body);
}

export const BalanceRoute = (token: string) =>
  ["/api/v1/balance", (c: Context) => balanceHandler(c, token)] as const;
