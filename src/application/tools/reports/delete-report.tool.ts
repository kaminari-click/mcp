/**
 * Tool: `delete_report` — permanently delete an owned saved report.
 */

import { z } from "zod";

import { err, ok, type Result } from "../../../shared/result.js";
import { mapApiError } from "../../services/api-error-mapper.js";
import type { Tool } from "../_shared/tool.js";
import type { ToolError } from "../_shared/tool-result.js";

const InputShape = {
  id: z.number().int().min(1).describe("Saved report id to delete."),
} as const;

export interface DeleteReportOutput {
  readonly deleted: boolean;
}

export const deleteReportTool: Tool<typeof InputShape, DeleteReportOutput> = {
  name: "delete_report",
  description:
    "Permanently delete a saved report owned by this account. Cannot be undone; standard (admin) reports cannot be deleted.",
  annotations: {
    title: "Delete Report",
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
  inputSchema: z.object(InputShape),
  handler: async (input, ctx): Promise<Result<DeleteReportOutput, ToolError>> => {
    const result = await ctx.api.deleteReport(input.id);
    if (result.isErr()) return err(mapApiError(result.error));
    return ok({ deleted: result.value.deleted });
  },
};
