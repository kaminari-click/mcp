/**
 * Require an MCP / agent JWT: payload must include `isAgent: true`.
 *
 * Signature verification is optional (`jwtKey`). End-user installs of the
 * npm package typically omit the key — the UI API still verifies HS256 and
 * exact `Users.jwt_agent` match. When `jwtKey` is set (self-hosted), the
 * signature is verified before the claim check.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export type AgentJwtError =
  | { readonly kind: "malformed"; readonly message: string }
  | { readonly kind: "invalid-signature"; readonly message: string }
  | { readonly kind: "not-agent"; readonly message: string }
  | { readonly kind: "invalid-payload"; readonly message: string };

export type AgentJwtResult =
  | { readonly ok: true; readonly userId: number | string }
  | { readonly ok: false; readonly error: AgentJwtError };

function base64UrlToBuffer(input: string): Buffer | undefined {
  if (input.length === 0) return undefined;
  const padded = input + "=".repeat((4 - (input.length % 4)) % 4);
  return Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function bufferToBase64Url(buf: Buffer): string {
  return buf.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function decodeJsonPart(part: string): Record<string, unknown> | undefined {
  const buf = base64UrlToBuffer(part);
  if (buf === undefined) return undefined;
  try {
    return JSON.parse(buf.toString("utf8")) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

/**
 * Assert the Bearer is an agent JWT (`isAgent: true`).
 * Pass `jwtKey` to also verify HS256; omit to claim-check only.
 */
export function assertAgentBearer(token: string, jwtKey?: string, alg = "HS256"): AgentJwtResult {
  const parts = token.split(".");
  if (
    parts.length !== 3 ||
    parts[0] === undefined ||
    parts[1] === undefined ||
    parts[2] === undefined
  ) {
    return {
      ok: false,
      error: { kind: "malformed", message: "Token is not a JWT." },
    };
  }
  const [headerB64, payloadB64, signatureB64] = parts;

  if (jwtKey !== undefined && jwtKey.length > 0) {
    if (alg !== "HS256") {
      return {
        ok: false,
        error: { kind: "malformed", message: `Unsupported JWT alg: ${alg}.` },
      };
    }
    const header = decodeJsonPart(headerB64);
    if (header === undefined) {
      return { ok: false, error: { kind: "malformed", message: "Invalid JWT header." } };
    }
    if (header["alg"] !== "HS256") {
      return {
        ok: false,
        error: { kind: "malformed", message: "JWT alg must be HS256." },
      };
    }
    const signingInput = `${headerB64}.${payloadB64}`;
    const expectedSig = createHmac("sha256", jwtKey).update(signingInput, "utf8").digest();
    const expectedB64 = bufferToBase64Url(expectedSig);
    const actualBuf = Buffer.from(signatureB64);
    const expectedBuf = Buffer.from(expectedB64);
    if (actualBuf.length !== expectedBuf.length || !timingSafeEqual(actualBuf, expectedBuf)) {
      return {
        ok: false,
        error: { kind: "invalid-signature", message: "JWT signature verification failed." },
      };
    }
  }

  const payload = decodeJsonPart(payloadB64);
  if (payload === undefined) {
    return { ok: false, error: { kind: "malformed", message: "Invalid JWT payload." } };
  }

  if (payload["isAgent"] !== true) {
    return {
      ok: false,
      error: {
        kind: "not-agent",
        message:
          "This token is not an MCP / Agent token. Generate one in Account Settings (MCP / Agent token).",
      },
    };
  }

  const userId = payload["userId"];
  if (typeof userId !== "number" && typeof userId !== "string") {
    return {
      ok: false,
      error: { kind: "invalid-payload", message: "JWT payload is missing userId." },
    };
  }

  return { ok: true, userId };
}
