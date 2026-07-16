/**
 * Shared flat input shape for tools that submit a report definition
 * (`query_stats`, `save_report`, `share_report`). Keeps arguments
 * primitive and enum-constrained per MCP tool-design guidance; the
 * builder converts them into the API's nested `ReportQuery`.
 */

import { z } from "zod";

import type { ReportQuery, StatFilter } from "../../../domain/ports/api-gateway.js";

export const PERIOD_PRESETS = ["today", "yesterday", "currentWeek", "7days", "month"] as const;
export const COMPARE_MODES = ["diff", "percent", "compare_value"] as const;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const FilterItemSchema = z
  .object({
    id: z.string().min(1).describe("Dimension id, e.g. geo_country or sub_botType."),
    include: z.array(z.string()).optional().describe("Values to include (list filter)."),
    exclude: z.array(z.string()).optional().describe("Values to exclude (list filter)."),
    from: z.union([z.number(), z.string()]).optional().describe("Range start (range filter)."),
    to: z.union([z.number(), z.string()]).optional().describe("Range end (range filter)."),
  })
  .describe("One dimension filter: include/exclude values OR a from/to range.");

export const reportInputShape = {
  groups: z
    .array(z.string().min(1))
    .min(1)
    .describe("Dimension ids to group by, e.g. ['time_day','sub_1']. See list_stat_fields."),
  metrics: z
    .array(z.string().min(1))
    .min(1)
    .describe("Metric ids to return, e.g. ['summary_totalVisits','bots_totalPc']."),
  date_from: z
    .string()
    .regex(DATE_RE, "Use YYYY-MM-DD")
    .optional()
    .describe("Start date YYYY-MM-DD. Required unless period is set."),
  date_to: z
    .string()
    .regex(DATE_RE, "Use YYYY-MM-DD")
    .optional()
    .describe("End date YYYY-MM-DD. Max range ~2 months."),
  period: z.enum(PERIOD_PRESETS).optional().describe("Date preset; overrides date_from/date_to."),
  timezone: z.number().int().min(-12).max(14).optional().describe("UTC offset hours, default 0."),
  filters: z.array(FilterItemSchema).optional().describe("Dimension filters."),
  compare_date_from: z
    .string()
    .regex(DATE_RE, "Use YYYY-MM-DD")
    .optional()
    .describe("Comparison period start; enables previous-period comparison."),
  compare_date_to: z
    .string()
    .regex(DATE_RE, "Use YYYY-MM-DD")
    .optional()
    .describe("Comparison period end."),
  compare_period: z.enum(PERIOD_PRESETS).optional().describe("Comparison date preset."),
  compare_mode: z
    .enum(COMPARE_MODES)
    .optional()
    .describe("How deltas are reported: absolute diff, percent, or raw compare value."),
  compare_sort: z
    .boolean()
    .optional()
    .describe(
      "Sort rows by comparison deltas (dashboard 'sort by diffs'). Always sent as compare.sort; default false."
    ),
  sort_field: z.string().optional().describe("Field id to sort rows by."),
  sort_dir: z.enum(["ASC", "DESC"]).optional().describe("Sort direction, default DESC."),
} as const;

export type ReportInput = z.infer<z.ZodObject<typeof reportInputShape>>;

/** Convert the flat tool input into the API's nested report body. */
export function buildReportQuery(input: ReportInput): ReportQuery {
  const filters: StatFilter[] = (input.filters ?? []).map((f) => {
    const isRange = f.from !== undefined || f.to !== undefined;
    return {
      id: f.id,
      type: isRange ? ("range" as const) : ("list" as const),
      ...(f.include !== undefined ? { include: f.include } : {}),
      ...(f.exclude !== undefined ? { exclude: f.exclude } : {}),
      ...(isRange
        ? {
            range: {
              ...(f.from !== undefined ? { from: f.from } : {}),
              ...(f.to !== undefined ? { to: f.to } : {}),
            },
          }
        : {}),
    };
  });

  const hasCompare =
    input.compare_date_from !== undefined ||
    input.compare_date_to !== undefined ||
    input.compare_period !== undefined;

  return {
    groups: input.groups,
    metrics: input.metrics,
    filters: {
      ...(input.date_from !== undefined ? { dateFrom: input.date_from } : {}),
      ...(input.date_to !== undefined ? { dateTo: input.date_to } : {}),
      ...(input.period !== undefined ? { period: input.period } : {}),
      timezone: input.timezone ?? 0,
      filters,
    },
    ...(hasCompare
      ? {
          compare: {
            ...(input.compare_date_from !== undefined ? { dateFrom: input.compare_date_from } : {}),
            ...(input.compare_date_to !== undefined ? { dateTo: input.compare_date_to } : {}),
            ...(input.compare_period !== undefined ? { period: input.compare_period } : {}),
            mode: input.compare_mode ?? "diff",
            // Always present — UI PHP reads compare['sort'] without isset().
            sort: input.compare_sort ?? false,
          },
        }
      : {}),
    ...(input.sort_field !== undefined
      ? { sort: { [input.sort_field]: input.sort_dir ?? "DESC" } }
      : {}),
  };
}
