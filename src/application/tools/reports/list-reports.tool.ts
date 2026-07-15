/**
 * Tool: `list_reports` — the account's saved reports.
 */

import { z } from "zod";

import type { ReportListItem } from "../../../domain/ports/api-gateway.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { mapApiError } from "../../services/api-error-mapper.js";
import type { Tool } from "../_shared/tool.js";
import type { ToolError } from "../_shared/tool-result.js";

const InputShape = {} as const;

export interface ListReportsOutput {
  readonly items: readonly ReportListItem[];
}

export const listReportsTool: Tool<typeof InputShape, ListReportsOutput> = {
  name: "list_reports",
  description:
    "List saved reports (personal and standard). Returns id, name and type; fetch the full definition with get_report.",
  annotations: {
    title: "List Reports",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  inputSchema: z.object(InputShape),
  handler: async (_input, ctx): Promise<Result<ListReportsOutput, ToolError>> => {
    const result = await ctx.api.listReports();
    if (result.isErr()) return err(mapApiError(result.error));
    return ok({ items: result.value });
  },
};
