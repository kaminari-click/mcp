/**
 * Tool: `list_stat_fields` — the account's grouping/metric catalog.
 */

import { z } from "zod";

import type { StatFieldCatalog } from "../../../domain/ports/api-gateway.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { mapApiError } from "../../services/api-error-mapper.js";
import type { Tool } from "../_shared/tool.js";
import type { ToolError } from "../_shared/tool-result.js";

const InputShape = {} as const;

export const listStatFieldsTool: Tool<typeof InputShape, StatFieldCatalog> = {
  name: "list_stat_fields",
  description:
    "List grouping dimensions and metrics available to this account. Call before query_stats — availability is account-specific. IVT lives in the `bots` metrics (bots_total, bots_totalPc).",
  annotations: {
    title: "List Stat Fields",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  inputSchema: z.object(InputShape),
  handler: async (_input, ctx): Promise<Result<StatFieldCatalog, ToolError>> => {
    const result = await ctx.api.getStatFields();
    if (result.isErr()) return err(mapApiError(result.error));
    return ok(result.value);
  },
};
