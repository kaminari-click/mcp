/**
 * PKCE S256 helper (RFC 7636 §4.6): base64url(sha256(verifier)).
 */

import { createHash, timingSafeEqual } from "node:crypto";

export function computeS256Challenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

/** Constant-time comparison of the expected and derived challenge. */
export function verifyS256(verifier: string, expectedChallenge: string): boolean {
  const derived = Buffer.from(computeS256Challenge(verifier));
  const expected = Buffer.from(expectedChallenge);
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}
