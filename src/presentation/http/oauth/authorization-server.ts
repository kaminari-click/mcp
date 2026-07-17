/**
 * Simplified OAuth 2.0 Authorization Server built into the HTTP
 * transport (for ChatGPT / Claude connectors that require OAuth).
 *
 * Flow: authorization-code + PKCE S256 + Dynamic Client Registration.
 * The "authorization" step is intentionally simple — the user pastes
 * their Kaminari Click API token into an HTML form, and the token
 * endpoint later returns that very token as the `access_token`. The
 * server never validates or persists tokens beyond the 5-minute
 * one-time authorization code window, and issues no credentials of
 * its own.
 */

import { randomUUID } from "node:crypto";

import type { Clock } from "../../../domain/ports/clock.js";
import { assertAgentBearer } from "../../../shared/agent-jwt.js";
import { verifyS256 } from "./pkce.js";

/** Authorization-code TTL. */
const CODE_TTL_MS = 5 * 60 * 1000;
/** Default cap on outstanding codes — drops the oldest beyond this. */
const DEFAULT_MAX_PENDING_CODES = 10_000;

export type OAuthMetadata = Readonly<Record<string, unknown>>;

export interface AuthorizeQuery {
  readonly response_type?: string | undefined;
  readonly client_id?: string | undefined;
  readonly redirect_uri?: string | undefined;
  readonly state?: string | undefined;
  readonly code_challenge?: string | undefined;
  readonly code_challenge_method?: string | undefined;
}

export type AuthorizeSubmitResult =
  | { readonly kind: "redirect"; readonly location: string }
  | { readonly kind: "error"; readonly status: number; readonly message: string };

export type TokenResult =
  | { readonly kind: "ok"; readonly accessToken: string }
  | {
      readonly kind: "error";
      readonly status: number;
      readonly error: string;
      readonly description: string;
    };

interface PendingCode {
  readonly apiToken: string;
  readonly codeChallenge: string;
  readonly redirectUri: string;
  readonly clientId: string;
  readonly expiresAtMs: number;
}

export interface AuthorizationServer {
  buildAuthorizationServerMetadata(): OAuthMetadata;
  buildProtectedResourceMetadata(resource: string, metadataUrl: string): OAuthMetadata;
  register(body: unknown): { readonly status: number; readonly body: OAuthMetadata };
  renderAuthorizePage(query: AuthorizeQuery): { readonly status: number; readonly html: string };
  submitAuthorize(form: Readonly<Record<string, string>>): AuthorizeSubmitResult;
  exchangeToken(form: Readonly<Record<string, string>>): TokenResult;
}

function validateAuthorizeQuery(query: AuthorizeQuery): string | undefined {
  if (query.response_type !== "code") return "response_type must be 'code'.";
  if (query.client_id === undefined || query.client_id.length === 0) {
    return "client_id is required.";
  }
  if (query.redirect_uri === undefined || !isSafeRedirectUri(query.redirect_uri)) {
    return "redirect_uri must be a valid https:// URL (or http://localhost / custom scheme).";
  }
  if (query.code_challenge === undefined || query.code_challenge.length === 0) {
    return "code_challenge is required (PKCE S256).";
  }
  if (query.code_challenge_method !== "S256") return "code_challenge_method must be 'S256'.";
  return undefined;
}

function isSafeRedirectUri(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol === "https:") return true;
  if (url.protocol === "http:") {
    return url.hostname === "localhost" || url.hostname === "127.0.0.1";
  }
  // Custom app schemes (e.g. cursor://, claude://) are allowed.
  return !url.protocol.startsWith("javascript") && !url.protocol.startsWith("data");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function createAuthorizationServer(deps: {
  readonly issuerUrl: string;
  readonly clock: Clock;
  readonly jwtKey?: string;
  readonly jwtAlg?: string;
  /** Overridable in tests; production uses the default. */
  readonly maxPendingCodes?: number;
}): AuthorizationServer {
  const issuer = deps.issuerUrl.replace(/\/+$/, "");
  const { clock } = deps;
  const jwtKey = deps.jwtKey;
  const jwtAlg = deps.jwtAlg ?? "HS256";
  const maxPendingCodes = deps.maxPendingCodes ?? DEFAULT_MAX_PENDING_CODES;
  const pendingCodes = new Map<string, PendingCode>();

  function sweepExpired(): void {
    const now = clock.nowMs();
    for (const [code, pending] of pendingCodes) {
      if (pending.expiresAtMs <= now) pendingCodes.delete(code);
    }
    // Bound memory even under a flood of never-exchanged codes:
    // evict oldest-first until we're back under the cap.
    for (const oldest of pendingCodes.keys()) {
      if (pendingCodes.size <= maxPendingCodes) break;
      pendingCodes.delete(oldest);
    }
  }

  return {
    buildAuthorizationServerMetadata(): OAuthMetadata {
      return {
        issuer,
        authorization_endpoint: `${issuer}/authorize`,
        token_endpoint: `${issuer}/token`,
        registration_endpoint: `${issuer}/register`,
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code"],
        code_challenge_methods_supported: ["S256"],
        token_endpoint_auth_methods_supported: ["none"],
      };
    },

    buildProtectedResourceMetadata(resource: string, _metadataUrl: string): OAuthMetadata {
      return {
        resource,
        authorization_servers: [issuer],
        bearer_methods_supported: ["header"],
      };
    },

    register(body: unknown): { status: number; body: OAuthMetadata } {
      const record =
        body !== null && typeof body === "object" ? (body as Record<string, unknown>) : {};
      const redirectUris = Array.isArray(record["redirect_uris"])
        ? record["redirect_uris"].filter((u): u is string => typeof u === "string")
        : [];
      if (redirectUris.length === 0 || !redirectUris.every(isSafeRedirectUri)) {
        return {
          status: 400,
          body: {
            error: "invalid_redirect_uri",
            error_description: "redirect_uris must contain at least one valid URI.",
          },
        };
      }
      return {
        status: 201,
        body: {
          client_id: randomUUID(),
          redirect_uris: redirectUris,
          token_endpoint_auth_method: "none",
          grant_types: ["authorization_code"],
          response_types: ["code"],
        },
      };
    },

    renderAuthorizePage(query: AuthorizeQuery): { status: number; html: string } {
      const validationError = validateAuthorizeQuery(query);
      if (validationError !== undefined) {
        return {
          status: 400,
          html: `<!doctype html><html><body><h1>Invalid request</h1><p>${escapeHtml(validationError)}</p></body></html>`,
        };
      }
      const hidden = (name: string, value: string): string =>
        `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`;
      const html = [
        "<!doctype html>",
        '<html><head><meta charset="utf-8"><title>Connect Kaminari Click</title>',
        "<style>body{font-family:system-ui,sans-serif;max-width:420px;margin:10vh auto;padding:0 16px;color:#1a1a2e}",
        "input[type=password]{width:100%;padding:10px;margin:12px 0;border:1px solid #ccc;border-radius:6px;box-sizing:border-box}",
        "button{width:100%;padding:12px;background:#4548e6;color:#fff;border:0;border-radius:6px;font-size:15px;cursor:pointer}",
        "p{color:#555;font-size:14px;line-height:1.5}</style></head><body>",
        "<h2>Connect Kaminari Click</h2>",
        "<p>Paste your MCP / Agent token from the Kaminari Click account settings. ",
        "The token is passed to your AI client and is never stored by this server.</p>",
        '<form method="POST" action="/authorize">',
        '<input type="password" name="token" placeholder="MCP / Agent token" required autofocus>',
        hidden("client_id", query.client_id ?? ""),
        hidden("redirect_uri", query.redirect_uri ?? ""),
        hidden("state", query.state ?? ""),
        hidden("code_challenge", query.code_challenge ?? ""),
        hidden("code_challenge_method", query.code_challenge_method ?? ""),
        '<button type="submit">Authorize</button>',
        "</form></body></html>",
      ].join("");
      return { status: 200, html };
    },

    submitAuthorize(form: Readonly<Record<string, string>>): AuthorizeSubmitResult {
      const validationError = validateAuthorizeQuery({
        response_type: "code",
        client_id: form["client_id"],
        redirect_uri: form["redirect_uri"],
        state: form["state"],
        code_challenge: form["code_challenge"],
        code_challenge_method: form["code_challenge_method"],
      });
      if (validationError !== undefined) {
        return { kind: "error", status: 400, message: validationError };
      }
      const token = form["token"]?.trim() ?? "";
      if (token.length < 8) {
        return { kind: "error", status: 400, message: "API token looks too short." };
      }
      const agentCheck = assertAgentBearer(token, jwtKey, jwtAlg);
      if (!agentCheck.ok) {
        return { kind: "error", status: 400, message: agentCheck.error.message };
      }
      sweepExpired();
      const code = randomUUID();
      pendingCodes.set(code, {
        apiToken: token,
        codeChallenge: form["code_challenge"] ?? "",
        redirectUri: form["redirect_uri"] ?? "",
        clientId: form["client_id"] ?? "",
        expiresAtMs: clock.nowMs() + CODE_TTL_MS,
      });
      const location = new URL(form["redirect_uri"] ?? "");
      location.searchParams.set("code", code);
      const state = form["state"];
      if (state !== undefined && state.length > 0) location.searchParams.set("state", state);
      return { kind: "redirect", location: location.toString() };
    },

    exchangeToken(form: Readonly<Record<string, string>>): TokenResult {
      if (form["grant_type"] !== "authorization_code") {
        return {
          kind: "error",
          status: 400,
          error: "unsupported_grant_type",
          description: "Only authorization_code is supported.",
        };
      }
      const code = form["code"] ?? "";
      const verifier = form["code_verifier"] ?? "";
      sweepExpired();
      const pending = pendingCodes.get(code);
      // One-time use: drop the code before any further checks.
      pendingCodes.delete(code);
      if (pending === undefined) {
        return {
          kind: "error",
          status: 400,
          error: "invalid_grant",
          description: "Authorization code is unknown, expired, or already used.",
        };
      }
      if (form["redirect_uri"] !== undefined && form["redirect_uri"] !== pending.redirectUri) {
        return {
          kind: "error",
          status: 400,
          error: "invalid_grant",
          description: "redirect_uri does not match the authorization request.",
        };
      }
      if (verifier.length === 0 || !verifyS256(verifier, pending.codeChallenge)) {
        return {
          kind: "error",
          status: 400,
          error: "invalid_grant",
          description: "PKCE verification failed.",
        };
      }
      return { kind: "ok", accessToken: pending.apiToken };
    },
  };
}
