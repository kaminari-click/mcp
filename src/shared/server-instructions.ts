/**
 * MCP server `instructions` sent to clients during the initialize
 * handshake. Kept short — this text lands in the agent's context.
 */

export const SERVER_INSTRUCTIONS = [
  "Kaminari Click — traffic-quality statistics (IVT/bot detection) for your account.",
  "",
  "Start with `list_stat_fields` to learn which grouping dimensions and metrics",
  "this account can query, then call `query_stats`. Use `search_filter_values`",
  "to resolve filter values (country codes, bot types, sub IDs).",
  "Share links returned by `share_report` are ready to send — never build",
  "report URLs yourself.",
].join("\n");
