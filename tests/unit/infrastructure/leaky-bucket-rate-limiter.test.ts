import { describe, expect, it } from "vitest";

import { createLeakyBucketRateLimiter } from "../../../src/infrastructure/rate-limit/leaky-bucket-rate-limiter.js";
import { createFakeClock } from "../../fakes/fake-clock.js";

describe("createLeakyBucketRateLimiter", () => {
  it("rejects rpm < 1", () => {
    expect(() => createLeakyBucketRateLimiter(createFakeClock(), 0)).toThrow();
  });

  it("allows up to rpm requests, then denies with a retry hint", () => {
    const clock = createFakeClock();
    const limiter = createLeakyBucketRateLimiter(clock, 3);
    expect(limiter.check("t1").allowed).toBe(true);
    expect(limiter.check("t1").allowed).toBe(true);
    expect(limiter.check("t1").allowed).toBe(true);
    const denied = limiter.check("t1");
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterMs).toBeGreaterThan(0);
  });

  it("refills over time", () => {
    const clock = createFakeClock();
    const limiter = createLeakyBucketRateLimiter(clock, 60);
    for (let i = 0; i < 60; i += 1) limiter.check("t1");
    expect(limiter.check("t1").allowed).toBe(false);
    clock.advance(1000); // 60 rpm => 1 token per second
    expect(limiter.check("t1").allowed).toBe(true);
  });

  it("isolates tenants", () => {
    const clock = createFakeClock();
    const limiter = createLeakyBucketRateLimiter(clock, 1);
    expect(limiter.check("t1").allowed).toBe(true);
    expect(limiter.check("t1").allowed).toBe(false);
    expect(limiter.check("t2").allowed).toBe(true);
  });

  it("sweeps idle buckets without changing behaviour", () => {
    const clock = createFakeClock();
    const limiter = createLeakyBucketRateLimiter(clock, 5);
    limiter.check("idle-tenant");
    clock.advance(120_000);
    // Drive enough checks to trigger the periodic sweep.
    for (let i = 0; i < 256; i += 1) limiter.check(`t${String(i)}`);
    // The idle tenant starts fresh (full bucket) after eviction.
    expect(limiter.check("idle-tenant").allowed).toBe(true);
  });
});
