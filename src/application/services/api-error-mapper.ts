/**
 * Maps {@link ApiError} (gateway failures) to {@link ToolError}
 * (agent-facing failures) with actionable messages — error text is
 * agent context, so it must say what to do next.
 */

import type { ApiError } from "../../domain/ports/api-gateway.js";
import type { ToolError } from "../tools/_shared/tool-result.js";

export function mapApiError(error: ApiError): ToolError {
  switch (error.kind) {
    case "unauthorized":
      return {
        kind: "unauthorized",
        message: `${error.message} Check the API token — regenerate it in the Kaminari Click account settings if needed.`,
      };
    case "forbidden":
      return {
        kind: "forbidden",
        message: `${error.message} This account or subscription does not include the requested resource.`,
      };
    case "not-found":
      return { kind: "not-found", message: error.message };
    case "rate-limited":
      return {
        kind: "rate-limited",
        message: `${error.message} Wait before retrying.`,
        ...(error.retryAfterMs !== undefined ? { retryAfterMs: error.retryAfterMs } : {}),
      };
    case "invalid-input":
      return { kind: "invalid-input", message: error.message };
    case "upstream":
      return {
        kind: "upstream",
        message: `${error.message} Try a smaller date range or fewer groups if the query timed out.`,
        ...(error.status !== undefined ? { status: error.status } : {}),
      };
    case "network":
      return { kind: "internal", message: `Network error reaching the API: ${error.message}` };
  }
}
