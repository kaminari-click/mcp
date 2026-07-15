/**
 * Tool: `share_report` — create a public share link for a report
 * slice (for partners / dispute evidence).
 */

import { z } from "zod";

import { err, ok, type Result } from "../../../shared/result.js";
import { mapApiError } from "../../services/api-error-mapper.js";
import { buildReportQuery, reportInputShape } from "../_shared/report-input.js";
import type { Tool } from "../_shared/tool.js";
import type { ToolError } from "../_shared/tool-result.js";

const InputShape = { ...reportInputShape } as const;

export interface ShareReportOutput {
  readonly report_key: string;
  readonly url: string;
  /** True when the shared snapshot was truncated to 2500 rows. */
  readonly limited: boolean;
}

export const shareReportTool: Tool<typeof InputShape, ShareReportOutput> = {
  name: "share_report",
  description:
    "Create a public share link for a report slice (same fields as query_stats) — for partners or dispute evidence. Link stays valid ~90 days; snapshots over 2500 rows are truncated (limited=true).",
  annotations: {
    title: "Share Report",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  inputSchema: z.object(InputShape),
  handler: async (input, ctx): Promise<Result<ShareReportOutput, ToolError>> => {
    if (input.date_from === undefined && input.period === undefined) {
      return err({
        kind: "invalid-input",
        message: "Provide either date_from/date_to or a period preset.",
      });
    }
    const result = await ctx.api.shareReport(buildReportQuery(input));
    if (result.isErr()) return err(mapApiError(result.error));
    const { key, limited } = result.value;
    return ok({
      report_key: key,
      url: `https://kaminari.click/stat?reportKey=${key}`,
      limited,
    });
  },
};
