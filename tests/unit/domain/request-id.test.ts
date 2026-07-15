import { describe, expect, it } from "vitest";

import { newRequestId } from "../../../src/domain/value-objects/request-id.js";

describe("newRequestId", () => {
  it("generates unique UUID v4 values", () => {
    const a = newRequestId();
    const b = newRequestId();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(a).not.toBe(b);
  });
});
