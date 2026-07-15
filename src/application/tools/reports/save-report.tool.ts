/**
 * Tool: `save_report` — create a saved report from a report definition.
 */

import { z } from "zod";

import { err, ok, type Result } from "../../../shared/result.js";
import { mapApiError } from "../../services/api-error-mapper.js";
import { buildReportQuery, reportInputShape } from "../_shared/report-input.js";
import type { Tool } from "../_shared/tool.js";
import type { ToolError } from "../_shared/tool-result.js";

const InputShape = {
  ...reportInputShape,
  name: z.string().min(1).max(255).describe("Report name shown in the dashboard."),
} as const;

export interface SaveReportOutput {
  readonly id: number;
}

export const saveReportTool: Tool<typeof InputShape, SaveReportOutput> = {
  name: "save_report",
  description:
    "Save a report definition (same fields as query_stats plus a name) so it appears in the dashboard's report list. Returns the new report id.",
  annotations: {
    title: "Save Report",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  inputSchema: z.object(InputShape),
  handler: async (input, ctx): Promise<Result<SaveReportOutput, ToolError>> => {
    if (input.date_from === undefined && input.period === undefined) {
      return err({
        kind: "invalid-input",
        message: "Provide either date_from/date_to or a period preset.",
      });
    }
    const result = await ctx.api.saveReport({ ...buildReportQuery(input), name: input.name });
    if (result.isErr()) return err(mapApiError(result.error));
    return ok({ id: result.value.id });
  },
};
