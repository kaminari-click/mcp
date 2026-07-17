import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { assertAgentBearer } from "../../../src/shared/agent-jwt.js";
import { signAgentJwt, signHs256Jwt, signPersonalJwt } from "../../fakes/sign-jwt.js";

const SECRET = "unit-test-secret";

describe("assertAgentBearer", () => {
  it("accepts a valid agent JWT without a local signing key", () => {
    const token = signAgentJwt(42, SECRET);
    const result = assertAgentBearer(token);
    expect(result).toEqual({ ok: true, userId: 42 });
  });

  it("accepts a valid agent JWT when jwtKey is set", () => {
    const token = signAgentJwt(42, SECRET);
    const result = assertAgentBearer(token, SECRET);
    expect(result).toEqual({ ok: true, userId: 42 });
  });

  it("rejects a personal API JWT without isAgent", () => {
    const token = signPersonalJwt(42, SECRET);
    const result = assertAgentBearer(token, SECRET);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("not-agent");
  });

  it("rejects a forged signature", () => {
    const token = signAgentJwt(42, SECRET);
    const result = assertAgentBearer(token, "wrong-secret");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("invalid-signature");
  });

  it("rejects malformed tokens", () => {
    expect(assertAgentBearer("not-a-jwt", SECRET).ok).toBe(false);
    expect(assertAgentBearer("a.b", SECRET).ok).toBe(false);
  });

  it("rejects non-HS256 alg", () => {
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({ userId: 1, isAgent: true })).toString("base64url");
    const token = `${header}.${payload}.x`;
    const result = assertAgentBearer(token, SECRET);
    expect(result.ok).toBe(false);
  });

  it("rejects missing userId", () => {
    const token = signHs256Jwt({ iat: 1, isAgent: true }, SECRET);
    const result = assertAgentBearer(token, SECRET);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("invalid-payload");
  });

  it("rejects unsupported configured alg", () => {
    const token = signAgentJwt(1, SECRET);
    const result = assertAgentBearer(token, SECRET, "RS256");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("malformed");
  });

  it("uses timing-safe compare against a valid HMAC", () => {
    // Sanity: signature bytes match createHmac directly.
    const token = signAgentJwt(7, SECRET);
    const parts = token.split(".");
    expect(parts).toHaveLength(3);
    const [h, p, s] = parts as [string, string, string];
    const expected = createHmac("sha256", SECRET).update(`${h}.${p}`, "utf8").digest("base64url");
    expect(s).toBe(expected);
    expect(assertAgentBearer(token, SECRET).ok).toBe(true);
  });

  it("rejects empty/invalid JWT parts when a signing key is set", () => {
    expect(assertAgentBearer(".payload.sig", SECRET).ok).toBe(false);
    const badHeader = Buffer.from("not-json").toString("base64url");
    const payload = Buffer.from(JSON.stringify({ userId: 1, isAgent: true })).toString("base64url");
    expect(assertAgentBearer(`${badHeader}.${payload}.sig`, SECRET).ok).toBe(false);
  });

  it("rejects an empty payload segment", () => {
    const header = Buffer.from(JSON.stringify({ alg: "HS256" })).toString("base64url");
    expect(assertAgentBearer(`${header}..sig`).ok).toBe(false);
  });
});
