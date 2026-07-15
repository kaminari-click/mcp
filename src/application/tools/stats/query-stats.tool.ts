/**
 * Tool: `query_stats` — the main statistics slice query, with optional
 * previous-period comparison.
 */

import { z } from "zod";

import type { StatDataResult } from "../../../domain/ports/api-gateway.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { mapApiError } from "../../services/api-error-mapper.js";
import { buildReportQuery, reportInputShape } from "../_shared/report-input.js";
import type { Tool } from "../_shared/tool.js";
import type { ToolError } from "../_shared/tool-result.js";

const InputShape = {
  ...reportInputShape,
  page: z.number().int().min(1).default(1).describe("1-indexed page number."),
  per_page: z.number().int().min(1).max(500).default(50).describe("Rows per page."),
} as const;

export interface QueryStatsOutput {
  readonly rows: StatDataResult["rows"];
  readonly total: StatDataResult["total"];
  readonly total_rows: number;
  readonly page: number;
  readonly per_page: number;
  readonly has_more: boolean;
}

export const queryStatsTool: Tool<typeof InputShape, QueryStatsOutput> = {
  name: "query_stats",
  description:
    "Query traffic statistics: group by dimensions, return metrics, filter, and optionally compare with a previous period. Use YYYY-MM-DD dates (range up to ~2 months) or a period preset.",
  annotations: {
    title: "Query Statistics",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  inputSchema: z.object(InputShape),
  handler: async (input, ctx): Promise<Result<QueryStatsOutput, ToolError>> => {
    if (input.date_from === undefined && input.period === undefined) {
      return err({
        kind: "invalid-input",
        message: "Provide either date_from/date_to or a period preset.",
      });
    }
    const query = { ...buildReportQuery(input), page: input.page, perPage: input.per_page };
    const result = await ctx.api.queryStatData(query);
    if (result.isErr()) return err(mapApiError(result.error));
    const data = result.value;
    return ok({
      rows: data.rows,
      total: data.total,
      total_rows: data.totalRows,
      page: data.page,
      per_page: data.perPage,
      has_more: data.page * data.perPage < data.totalRows,
    });
  },
};
