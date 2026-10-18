import type { Context } from "hono";

import { MODELS } from "../utils/mod";

function modelsHandler(c: Context) {
  return c.json({
    object: "list",
    data: MODELS.map((id) => ({ id, object: "model", owned_by: "thursday" })),
  });
}

export const ModelsRoute = () =>
  ["/api/v1/models", (c: Context) => modelsHandler(c)] as const;
