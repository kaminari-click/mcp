/**
 * Tool: `check_database_access` — subscription check for a reference
 * database before attempting a download.
 */

import { z } from "zod";

import { err, ok, type Result } from "../../../shared/result.js";
import { mapApiError } from "../../services/api-error-mapper.js";
import type { Tool } from "../_shared/tool.js";
import type { ToolError } from "../_shared/tool-result.js";

const InputShape = {
  kind: z
    .enum(["ip_bot", "ip_vpn", "ua_bot"])
    .describe("Database: ip_bot = risk-score IPs, ip_vpn = VPN IPs, ua_bot = bot User-Agents."),
} as const;

export interface CheckDatabaseAccessOutput {
  readonly accessible: boolean;
}

export const checkDatabaseAccessTool: Tool<typeof InputShape, CheckDatabaseAccessOutput> = {
  name: "check_database_access",
  description:
    "Check whether this account's subscription includes the given IP/UA reference database. Call before download_database.",
  annotations: {
    title: "Check Database Access",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  inputSchema: z.object(InputShape),
  handler: async (input, ctx): Promise<Result<CheckDatabaseAccessOutput, ToolError>> => {
    const result = await ctx.api.verifyDatabaseAccess(input.kind);
    if (result.isErr()) return err(mapApiError(result.error));
    return ok({ accessible: result.value.ok });
  },
};
