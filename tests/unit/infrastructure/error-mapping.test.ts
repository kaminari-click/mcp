import { describe, expect, it } from "vitest";

import { extractApiMessage, toApiError } from "../../../src/infrastructure/api/error-mapping.js";

describe("extractApiMessage", () => {
  it("uses a non-empty string body", () => {
    expect(extractApiMessage("Boom", "fallback")).toBe("Boom");
  });

  it("falls back for an empty string body", () => {
    expect(extractApiMessage("  ", "fallback")).toBe("fallback");
  });

  it("reads msg as string", () => {
    expect(extractApiMessage({ msg: "Bad input" }, "f")).toBe("Bad input");
  });

  it("joins msg arrays", () => {
    expect(extractApiMessage({ msg: ["a", "b"] }, "f")).toBe("a; b");
  });

  it("skips non-string entries in msg arrays", () => {
    expect(extractApiMessage({ msg: [1, 2] }, "f")).toBe("f");
  });

  it("reads top-level error", () => {
    expect(extractApiMessage({ error: "Denied" }, "f")).toBe("Denied");
  });

  it("reads data.error", () => {
    expect(extractApiMessage({ data: { error: "Inner" } }, "f")).toBe("Inner");
  });

  it("falls back for null / unknown shapes", () => {
    expect(extractApiMessage(null, "f")).toBe("f");
    expect(extractApiMessage({ data: 5 }, "f")).toBe("f");
    expect(extractApiMessage({ msg: "" }, "f")).toBe("f");
  });
});

describe("toApiError", () => {
  it("maps 401 to unauthorized", () => {
    expect(toApiError(401, {})).toMatchObject({ kind: "unauthorized" });
  });

  it("maps 403 to forbidden", () => {
    expect(toApiError(403, {})).toMatchObject({ kind: "forbidden" });
  });

  it("maps 404 to not-found", () => {
    expect(toApiError(404, {})).toMatchObject({ kind: "not-found" });
  });

  it("maps 429 with and without retry-after", () => {
    expect(toApiError(429, {}, 30_000)).toMatchObject({
      kind: "rate-limited",
      retryAfterMs: 30_000,
    });
    expect("retryAfterMs" in toApiError(429, {})).toBe(false);
  });

  it("maps 400/405/422 to invalid-input", () => {
    for (const status of [400, 405, 422]) {
      expect(toApiError(status, {})).toMatchObject({ kind: "invalid-input" });
    }
  });

  it("maps everything else to upstream with status", () => {
    expect(toApiError(502, {})).toMatchObject({ kind: "upstream", status: 502 });
    expect(toApiError(500, {}).message).toContain("500");
  });
});
