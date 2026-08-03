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
  it("surfaces the server message as-is for statuses below 500", () => {
    expect(toApiError(400, { msg: "Field 'from' is required" })).toMatchObject({
      kind: "upstream",
      status: 400,
      message: "Field 'from' is required",
    });
    expect(toApiError(401, { error: "Invalid token" }).message).toBe("Invalid token");
    expect(toApiError(404, { data: { error: "Report 7 not found" } }).message).toBe(
      "Report 7 not found",
    );
    expect(toApiError(429, "Slow down").message).toBe("Slow down");
  });

  it("falls back to a generic HTTP message when the body carries none", () => {
    expect(toApiError(403, {}).message).toContain("403");
  });

  it("masks every 5xx as Internal server error without leaking the body", () => {
    expect(toApiError(500, { error: "stack trace here" })).toMatchObject({
      kind: "upstream",
      status: 500,
      message: "Internal server error",
    });
    expect(toApiError(502, { msg: "db down" }).message).toBe("Internal server error");
    expect(toApiError(503, "Service Unavailable").message).toBe("Internal server error");
  });

  it("always uses the upstream kind and preserves the status", () => {
    for (const status of [400, 401, 403, 404, 422, 429, 500, 503]) {
      expect(toApiError(status, {})).toMatchObject({ kind: "upstream", status });
    }
  });
});
