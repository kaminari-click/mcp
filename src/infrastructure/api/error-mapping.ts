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

/** Map a non-success HTTP response to a typed {@link ApiError}. */
export function toApiError(status: number, body: unknown, retryAfterMs?: number): ApiError {
  switch (status) {
    case 401:
      return {
        kind: "unauthorized",
        message: extractApiMessage(body, "Invalid or revoked API token."),
      };
    case 403:
      return { kind: "forbidden", message: extractApiMessage(body, "Access denied.") };
    case 404:
      return { kind: "not-found", message: extractApiMessage(body, "Resource not found.") };
    case 429:
      return {
        kind: "rate-limited",
        message: extractApiMessage(body, "API rate limit hit."),
        ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
      };
    case 400:
    case 405:
    case 422:
      return {
        kind: "invalid-input",
        message: extractApiMessage(body, "The API rejected the request."),
      };
    default:
      return {
        kind: "upstream",
        message: extractApiMessage(body, `API responded with HTTP ${String(status)}.`),
        status,
      };
  }
}
