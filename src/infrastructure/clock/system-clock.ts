/**
 * Wall-clock {@link Clock} implementation.
 */

import type { Clock } from "../../domain/ports/clock.js";

export function createSystemClock(): Clock {
  return {
    nowMs(): number {
      return Date.now();
    },
  };
}
