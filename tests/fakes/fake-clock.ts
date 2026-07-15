/**
 * Deterministic {@link Clock} with explicit `advance(ms)`.
 */

import type { Clock } from "../../src/domain/ports/clock.js";

export interface FakeClock extends Clock {
  advance(ms: number): void;
}

export function createFakeClock(startMs = 1_000_000): FakeClock {
  let now = startMs;
  return {
    nowMs(): number {
      return now;
    },
    advance(ms: number): void {
      now += ms;
    },
  };
}
