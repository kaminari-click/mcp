/** Build HS256 JWTs for tests (mirrors UI firebase/php-jwt encoding). */

import { createHmac } from "node:crypto";

function toBase64Url(input: string | Buffer): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

export function signHs256Jwt(payload: Readonly<Record<string, unknown>>, secret: string): string {
  const header = toBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = toBase64Url(JSON.stringify(payload));
  const sig = createHmac("sha256", secret).update(`${header}.${body}`, "utf8").digest();
  return `${header}.${body}.${toBase64Url(sig)}`;
}

export function signAgentJwt(
  userId: number,
  secret: string,
  extra: Readonly<Record<string, unknown>> = {}
): string {
  return signHs256Jwt(
    { iat: Math.floor(Date.now() / 1000), userId, isAgent: true, ...extra },
    secret
  );
}

export function signPersonalJwt(userId: number, secret: string): string {
  return signHs256Jwt({ iat: Math.floor(Date.now() / 1000), userId }, secret);
}
