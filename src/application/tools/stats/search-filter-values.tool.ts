/**
 * Tool: `search_filter_values` — autocomplete values for a filterable
 * dimension (country codes, bot types, sub IDs, ...).
 */

import { z } from "zod";

import type { FilterValue } from "../../../domain/ports/api-gateway.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { mapApiError } from "../../services/api-error-mapper.js";
import type { Tool } from "../_shared/tool.js";
import type { ToolError } from "../_shared/tool-result.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const InputShape = {
  id: z
    .string()
    .min(1)
    .describe("Filterable dimension id, e.g. geo_country, sub_botType, device_os."),
  search_query: z.string().optional().describe("Substring to search for."),
  date_from: z
    .string()
    .regex(DATE_RE, "Use YYYY-MM-DD")
    .optional()
    .describe("Restrict to values seen since this date (default: 2 months back)."),
  date_to: z
    .string()
    .regex(DATE_RE, "Use YYYY-MM-DD")
    .optional()
    .describe("Restrict to values seen until this date (default: today)."),
} as const;

export interface SearchFilterValuesOutput {
  readonly items: readonly FilterValue[];
}

export const searchFilterValuesTool: Tool<typeof InputShape, SearchFilterValuesOutput> = {
  name: "search_filter_values",
  description:
    "Look up valid values for a dimension filter (e.g. which countries or bot types exist in the account's data). Use the returned `id` values in query_stats filters.",
  annotations: {
    title: "Search Filter Values",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  inputSchema: z.object(InputShape),
  handler: async (input, ctx): Promise<Result<SearchFilterValuesOutput, ToolError>> => {
    const result = await ctx.api.searchFilterValues({
      id: input.id,
      ...(input.search_query !== undefined ? { searchQuery: input.search_query } : {}),
      ...(input.date_from !== undefined ? { dateFrom: input.date_from } : {}),
      ...(input.date_to !== undefined ? { dateTo: input.date_to } : {}),
    });
    if (result.isErr()) return err(mapApiError(result.error));
    return ok({ items: result.value });
  },
};
