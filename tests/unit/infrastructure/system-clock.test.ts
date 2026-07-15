import { describe, expect, it } from "vitest";

import { createSystemClock } from "../../../src/infrastructure/clock/system-clock.js";

describe("createSystemClock", () => {
  it("tracks Date.now", () => {
    const clock = createSystemClock();
    const before = Date.now();
    const now = clock.nowMs();
    const after = Date.now();
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(after);
  });
});
