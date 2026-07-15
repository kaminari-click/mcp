/**
 * Tool: `get_report` — full definition of one saved report.
 */

import { z } from "zod";

import type { ReportSchema } from "../../../domain/ports/api-gateway.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { mapApiError } from "../../services/api-error-mapper.js";
import type { Tool } from "../_shared/tool.js";
import type { ToolError } from "../_shared/tool-result.js";

const InputShape = {
  id: z.number().int().min(1).describe("Saved report id from list_reports."),
} as const;

export const getReportTool: Tool<typeof InputShape, ReportSchema> = {
  name: "get_report",
  description:
    "Get a saved report's definition (groups, metrics, filters, compare, sort). Run it by passing the same fields to query_stats.",
  annotations: {
    title: "Get Report",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  inputSchema: z.object(InputShape),
  handler: async (input, ctx): Promise<Result<ReportSchema, ToolError>> => {
    const result = await ctx.api.getReport(input.id);
    if (result.isErr()) return err(mapApiError(result.error));
    return ok(result.value);
  },
};
