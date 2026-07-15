/**
 * Time source, injected so tests can use a fake clock with explicit
 * `advance(ms)` instead of the wall clock.
 */

export interface Clock {
  /** Milliseconds since the Unix epoch (`Date.now()` in production). */
  nowMs(): number;
}
