/**
 * HTTP status → {@link ApiError} mapping for the Kaminari Click API.
 *
 * The API wraps JSON responses in `{ code, data, success?, msg? }`;
 * error text may live in `msg` (array or string) or `data.error`.
 */

import type { ApiError } from "../../domain/ports/api-gateway.js";

/** Pull a human-readable message out of an error response body. */
export function extractApiMessage(body: unknown, fallback: string): string {
  if (typeof body === "string" && body.trim().length > 0) return body.trim();
  if (body !== null && typeof body === "object") {
    const record = body as Record<string, unknown>;
    const msg = record["msg"];
    if (typeof msg === "string" && msg.length > 0) return msg;
    if (Array.isArray(msg) && msg.length > 0) {
      const joined = msg.filter((m) => typeof m === "string").join("; ");
      if (joined.length > 0) return joined;
    }
    const error = record["error"];
    if (typeof error === "string" && error.length > 0) return error;
    const data = record["data"];
    if (data !== null && typeof data === "object") {
      const dataError = (data as Record<string, unknown>)["error"];
      if (typeof dataError === "string" && dataError.length > 0) return dataError;
    }
  }
  return fallback;
}

/**
 * Map a non-success HTTP response to an {@link ApiError}.
 *
 * Server faults (HTTP 5xx) are deliberately opaque — their body can leak
 * internal detail — so the agent only ever sees "Internal server error".
 * For any other status the real server message is surfaced as-is, so the
 * agent knows exactly what it did wrong.
 */
export function toApiError(status: number, body: unknown): ApiError {
  if (status >= 500) {
    return { kind: "upstream", message: "Internal server error", status };
  }
  return {
    kind: "upstream",
    message: extractApiMessage(body, `API responded with HTTP ${String(status)}.`),
    status,
  };
}
