/**
 * Tool: `download_database` — truncated slice of an IP/UA reference
 * database. Full databases run to millions of rows, so the tool
 * returns at most `max_lines` CSV lines plus a ready-made curl
 * command for the complete export.
 */

import { z } from "zod";

import { err, ok, type Result } from "../../../shared/result.js";
import { mapApiError } from "../../services/api-error-mapper.js";
import type { Tool } from "../_shared/tool.js";
import type { ToolError } from "../_shared/tool-result.js";

const DB_PATHS = {
  ip_bot: "/api/ip/bot",
  ip_vpn: "/api/ip/vpn",
  ua_bot: "/api/ua/bot",
} as const;

const InputShape = {
  kind: z
    .enum(["ip_bot", "ip_vpn", "ua_bot"])
    .describe(
      "Database: ip_bot = risk-score IPs (csv ip,score), ip_vpn = VPN IPs, ua_bot = bot User-Agents (csv value,unix_ts)."
    ),
  from: z
    .number()
    .int()
    .optional()
    .describe("Range start: risk score 1-100 for ip_bot, unix timestamp for ip_vpn/ua_bot."),
  to: z.number().int().optional().describe("Range end (same unit as from)."),
  max_lines: z
    .number()
    .int()
    .min(1)
    .max(10_000)
    .default(1000)
    .describe("Max CSV lines to return inline."),
} as const;

export interface DownloadDatabaseOutput {
  readonly lines: readonly string[];
  readonly returned_lines: number;
  readonly has_more: boolean;
  /** Ready-made command for the full export (uses the caller's own token). */
  readonly full_export_curl: string;
}

export const downloadDatabaseTool: Tool<typeof InputShape, DownloadDatabaseOutput> = {
  name: "download_database",
  description:
    "Fetch a slice of an IP/UA reference database as CSV lines (subscription required). Returns at most max_lines rows; for the full multi-million-row export use the returned curl command instead.",
  annotations: {
    title: "Download Database Slice",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  inputSchema: z.object(InputShape),
  handler: async (input, ctx): Promise<Result<DownloadDatabaseOutput, ToolError>> => {
    const result = await ctx.api.downloadDatabase({
      kind: input.kind,
      ...(input.from !== undefined ? { from: input.from } : {}),
      ...(input.to !== undefined ? { to: input.to } : {}),
      maxLines: input.max_lines,
    });
    if (result.isErr()) return err(mapApiError(result.error));
    const slice = result.value;
    const rangeSuffix =
      input.from !== undefined && input.to !== undefined
        ? `/from/${String(input.from)}/to/${String(input.to)}`
        : "";
    return ok({
      lines: slice.lines,
      returned_lines: slice.lines.length,
      has_more: slice.hasMore,
      full_export_curl: `curl https://kaminari.click${DB_PATHS[input.kind]}${rangeSuffix} -H 'Authorization: Bearer <your-api-token>' -o ${input.kind}.csv`,
    });
  },
};
