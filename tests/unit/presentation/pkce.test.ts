import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { computeS256Challenge, verifyS256 } from "../../../src/presentation/http/oauth/pkce.js";

describe("PKCE S256", () => {
  it("computes base64url(sha256(verifier))", () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    expect(computeS256Challenge(verifier)).toBe(
      createHash("sha256").update(verifier).digest("base64url")
    );
  });

  it("verifies a matching pair", () => {
    const verifier = "some-random-verifier-string";
    expect(verifyS256(verifier, computeS256Challenge(verifier))).toBe(true);
  });

  it("rejects a wrong verifier", () => {
    expect(verifyS256("wrong", computeS256Challenge("right"))).toBe(false);
  });

  it("rejects a challenge with a different length", () => {
    expect(verifyS256("v", "short")).toBe(false);
  });
});
