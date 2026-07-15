/**
 * Opaque value object wrapping the Kaminari Click API token (a JWT
 * issued in the account settings). The raw token is never exposed via
 * `toString` / `toJSON` / `util.inspect` — only:
 *
 *   - {@link BearerToken.hash} — short hex prefix for log correlation.
 *   - {@link BearerToken.toAuthorizationHeader} — the literal header
 *     value, used only by the HTTP API adapter for outbound requests.
 */

import { createHash } from "node:crypto";

const REDACTED = "[BearerToken redacted]";

/** Hex-prefix length for the `bearer_hash` log field. */
export const BEARER_HASH_PREFIX_LEN = 8;

/** Hard cap on inbound `Authorization` header length. */
const MAX_HEADER_LEN = 4096;

export class BearerToken {
  readonly #raw: string;

  private constructor(raw: string) {
    this.#raw = raw;
  }

  /** Construct from a raw string. Trims whitespace; rejects empty input. */
  static fromString(raw: string): BearerToken | undefined {
    const trimmed = raw.trim();
    if (trimmed.length === 0) return undefined;
    return new BearerToken(trimmed);
  }

  /**
   * Parse a raw `Authorization` header value (`Bearer <token>`,
   * scheme case-insensitive per RFC 6750). Returns `undefined` for
   * missing/malformed input.
   */
  static fromAuthorizationHeader(headerValue: string | undefined): BearerToken | undefined {
    if (headerValue === undefined) return undefined;
    if (headerValue.length > MAX_HEADER_LEN) return undefined;
    const match = /^Bearer\s+(\S+)\s*$/i.exec(headerValue);
    if (match?.[1] === undefined) return undefined;
    return BearerToken.fromString(match[1]);
  }

  /** First {@link BEARER_HASH_PREFIX_LEN} hex chars of sha256(token). */
  hash(): string {
    return createHash("sha256").update(this.#raw).digest("hex").slice(0, BEARER_HASH_PREFIX_LEN);
  }

  /** Full sha256 hex digest — rate-limiter key, never logged. */
  fullHash(): string {
    return createHash("sha256").update(this.#raw).digest("hex");
  }

  /** Literal header value for outbound API requests ONLY. */
  toAuthorizationHeader(): string {
    return `Bearer ${this.#raw}`;
  }

  toString(): string {
    return REDACTED;
  }

  toJSON(): string {
    return REDACTED;
  }

  [Symbol.for("nodejs.util.inspect.custom")](): string {
    return REDACTED;
  }
}
