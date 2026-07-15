/**
 * Tool-level error union. Tools return `Result<Output, ToolError>`;
 * the transport maps `Err` to an MCP error envelope with an
 * agent-actionable text message.
 */

export type ToolError =
  | { readonly kind: "unauthorized"; readonly message: string }
  | { readonly kind: "forbidden"; readonly message: string }
  | { readonly kind: "not-found"; readonly message: string }
  | { readonly kind: "rate-limited"; readonly message: string; readonly retryAfterMs?: number }
  | { readonly kind: "invalid-input"; readonly message: string }
  | { readonly kind: "upstream"; readonly message: string; readonly status?: number }
  | { readonly kind: "internal"; readonly message: string };
