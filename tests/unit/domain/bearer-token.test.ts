import { inspect } from "node:util";

import { describe, expect, it } from "vitest";

import { BearerToken } from "../../../src/domain/value-objects/bearer-token.js";

describe("BearerToken", () => {
  it("parses from a raw string, trimming whitespace", () => {
    const token = BearerToken.fromString("  my-secret  ");
    expect(token?.toAuthorizationHeader()).toBe("Bearer my-secret");
  });

  it("rejects an empty string", () => {
    expect(BearerToken.fromString("   ")).toBeUndefined();
  });

  it("parses a well-formed Authorization header case-insensitively", () => {
    expect(BearerToken.fromAuthorizationHeader("bearer abc.def.ghi")?.toAuthorizationHeader()).toBe(
      "Bearer abc.def.ghi"
    );
  });

  it("rejects missing, malformed, and oversized headers", () => {
    expect(BearerToken.fromAuthorizationHeader(undefined)).toBeUndefined();
    expect(BearerToken.fromAuthorizationHeader("Basic dXNlcg==")).toBeUndefined();
    expect(BearerToken.fromAuthorizationHeader("Bearer")).toBeUndefined();
    expect(BearerToken.fromAuthorizationHeader(`Bearer ${"x".repeat(5000)}`)).toBeUndefined();
  });

  it("produces a stable 8-char hash and full hash", () => {
    const token = BearerToken.fromString("my-secret")!;
    expect(token.hash()).toHaveLength(8);
    expect(token.fullHash()).toHaveLength(64);
    expect(token.fullHash().startsWith(token.hash())).toBe(true);
  });

  it("redacts the secret in toString, toJSON and util.inspect", () => {
    const token = BearerToken.fromString("my-secret")!;
    expect(String(token)).toBe("[BearerToken redacted]");
    expect(JSON.stringify(token)).toBe('"[BearerToken redacted]"');
    expect(inspect(token)).toContain("redacted");
    expect(inspect(token)).not.toContain("my-secret");
  });
});
