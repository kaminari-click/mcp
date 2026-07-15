/**
 * Per-tenant leaky-bucket rate limiter. Tenant key = bearer hash
 * (never the raw token). In-memory per process — a first-line defence
 * against runaway agent loops; the API keeps authoritative limits.
 *
 * The bucket map is swept every {@link SWEEP_EVERY_N_CHECKS} checks,
 * evicting buckets idle past the refill window (they are full again
 * anyway), so rotated tokens don't grow the map forever.
 */

import type { Clock } from "../../domain/ports/clock.js";
import type { RateLimitDecision, RateLimiter } from "../../domain/ports/rate-limiter.js";

interface Bucket {
  tokens: number;
  lastRefillMs: number;
}

const SWEEP_EVERY_N_CHECKS = 256;
const SWEEP_IDLE_MS = 60_000;

export function createLeakyBucketRateLimiter(clock: Clock, rpm: number): RateLimiter {
  if (rpm < 1) throw new Error("rpm must be >= 1");
  const refillPerMs = rpm / 60_000;
  const buckets = new Map<string, Bucket>();
  let checkCount = 0;

  function refill(bucket: Bucket): void {
    const now = clock.nowMs();
    const elapsed = now - bucket.lastRefillMs;
    if (elapsed > 0) {
      bucket.tokens = Math.min(rpm, bucket.tokens + elapsed * refillPerMs);
      bucket.lastRefillMs = now;
    }
  }

  function sweepIfDue(): void {
    checkCount += 1;
    if (checkCount % SWEEP_EVERY_N_CHECKS !== 0) return;
    const now = clock.nowMs();
    for (const [hash, bucket] of buckets) {
      if (now - bucket.lastRefillMs >= SWEEP_IDLE_MS) {
        buckets.delete(hash);
      }
    }
  }

  return {
    check(tenantHash: string): RateLimitDecision {
      sweepIfDue();
      let bucket = buckets.get(tenantHash);
      if (bucket === undefined) {
        bucket = { tokens: rpm, lastRefillMs: clock.nowMs() };
        buckets.set(tenantHash, bucket);
      }
      refill(bucket);
      if (bucket.tokens >= 1) {
        bucket.tokens -= 1;
        return { allowed: true };
      }
      const deficit = 1 - bucket.tokens;
      return { allowed: false, retryAfterMs: Math.ceil(deficit / refillPerMs) };
    },
  };
}
