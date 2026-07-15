/**
 * Per-tenant rate limiter for the HTTP transport, keyed by
 * `BearerToken.fullHash()` — the bucket map holds only hashes.
 * First-line defence against runaway agent loops; the API keeps its
 * own authoritative limits.
 */

export interface RateLimitDecision {
  readonly allowed: boolean;
  /** Wait hint (ms); always set when `allowed` is false. */
  readonly retryAfterMs?: number;
}

export interface RateLimiter {
  /** Consume one slot for the tenant hash, or deny with a retry hint. */
  check(tenantHash: string): RateLimitDecision;
}
