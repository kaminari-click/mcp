/**
 * Tool: `get_shared_report` — definition behind a share key.
 */

import { z } from "zod";

import type { ReportSchema } from "../../../domain/ports/api-gateway.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { mapApiError } from "../../services/api-error-mapper.js";
import type { Tool } from "../_shared/tool.js";
import type { ToolError } from "../_shared/tool-result.js";

const InputShape = {
  report_key: z
    .string()
    .min(1)
    .max(64)
    .describe("Share key — the reportKey value from a share URL."),
} as const;

export const getSharedReportTool: Tool<typeof InputShape, ReportSchema> = {
  name: "get_shared_report",
  description:
    "Get the report definition behind a share link (reportKey). Useful to inspect or re-run a slice a partner shared.",
  annotations: {
    title: "Get Shared Report",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  inputSchema: z.object(InputShape),
  handler: async (input, ctx): Promise<Result<ReportSchema, ToolError>> => {
    const result = await ctx.api.getSharedReport(input.report_key);
    if (result.isErr()) return err(mapApiError(result.error));
    return ok(result.value);
  },
};
