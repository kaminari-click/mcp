/**
 * Per-request handler for the hosted MCP endpoint — the single place
 * enforcing tenant isolation:
 *
 *   - missing Authorization is rejected before any API work, with a
 *     `WWW-Authenticate` pointer to the RFC 9728 metadata;
 *   - per-bearer rate limit before any API work;
 *   - per-request ApiGateway holding only this caller's Bearer;
 *   - single-use stateless MCP server per request.
 *
 * Also routes the simplified OAuth endpoints (metadata, DCR,
 * authorize, token) — see `oauth/authorization-server.ts`.
 */

import type { IncomingMessage, ServerResponse } from "node:http";

import type { Logger } from "../../domain/ports/logger.js";
import type { RateLimiter } from "../../domain/ports/rate-limiter.js";
import { BearerToken } from "../../domain/value-objects/bearer-token.js";
import { newRequestId } from "../../domain/value-objects/request-id.js";
import { createHttpApiGateway } from "../../infrastructure/api/http-api-gateway.js";
import type { Config } from "../../shared/config.js";
import { createStatelessMcp } from "./create-stateless-mcp.js";
import type { AuthorizationServer } from "./oauth/authorization-server.js";

export interface HttpRequestHandlerDeps {
  readonly config: Config;
  readonly logger: Logger;
  readonly rateLimiter: RateLimiter;
  readonly authServer: AuthorizationServer;
}

const MAX_BODY_BYTES = 1024 * 1024;

export function createHttpRequestHandler(
  deps: HttpRequestHandlerDeps
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  const { config, logger, rateLimiter, authServer } = deps;

  const bearerChallenge = `Bearer resource_metadata="${config.oauthProtectedResourceMetadataUrl}"`;

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://placeholder.invalid");
    const path = url.pathname;
    const method = req.method ?? "GET";

    if (method === "GET" && path === "/healthz") {
      writeJson(res, 200, { status: "ok" });
      return;
    }

    if (method === "GET" && path === "/.well-known/oauth-protected-resource") {
      writeJson(
        res,
        200,
        authServer.buildProtectedResourceMetadata(
          config.oauthProtectedResource,
          config.oauthProtectedResourceMetadataUrl
        ),
        { "cache-control": "public, max-age=3600" }
      );
      return;
    }

    if (method === "GET" && path === "/.well-known/oauth-authorization-server") {
      writeJson(res, 200, authServer.buildAuthorizationServerMetadata(), {
        "cache-control": "public, max-age=3600",
      });
      return;
    }

    if (method === "POST" && path === "/register") {
      const body = await readBody(req);
      let parsed: unknown;
      try {
        parsed = body.length > 0 ? JSON.parse(body) : {};
      } catch {
        writeJson(res, 400, { error: "invalid_client_metadata" });
        return;
      }
      const result = authServer.register(parsed);
      writeJson(res, result.status, result.body);
      return;
    }

    if (method === "GET" && path === "/authorize") {
      const page = authServer.renderAuthorizePage({
        response_type: url.searchParams.get("response_type") ?? undefined,
        client_id: url.searchParams.get("client_id") ?? undefined,
        redirect_uri: url.searchParams.get("redirect_uri") ?? undefined,
        state: url.searchParams.get("state") ?? undefined,
        code_challenge: url.searchParams.get("code_challenge") ?? undefined,
        code_challenge_method: url.searchParams.get("code_challenge_method") ?? undefined,
      });
      res.writeHead(page.status, { "content-type": "text/html; charset=utf-8" });
      res.end(page.html);
      return;
    }

    if (method === "POST" && path === "/authorize") {
      const form = parseForm(await readBody(req));
      const result = authServer.submitAuthorize(form);
      if (result.kind === "redirect") {
        res.writeHead(302, { location: result.location });
        res.end();
        return;
      }
      res.writeHead(result.status, { "content-type": "text/html; charset=utf-8" });
      res.end(`<!doctype html><html><body><h1>Error</h1><p>${result.message}</p></body></html>`);
      return;
    }

    if (method === "POST" && path === "/token") {
      const form = parseForm(await readBody(req));
      const result = authServer.exchangeToken(form);
      if (result.kind === "ok") {
        writeJson(
          res,
          200,
          { access_token: result.accessToken, token_type: "Bearer" },
          { "cache-control": "no-store", pragma: "no-cache" }
        );
        return;
      }
      writeJson(res, result.status, {
        error: result.error,
        error_description: result.description,
      });
      return;
    }

    if (path !== "/mcp" || (method !== "POST" && method !== "GET" && method !== "DELETE")) {
      writeJson(res, 404, { error: "Not found" });
      return;
    }

    const bearer = BearerToken.fromAuthorizationHeader(req.headers.authorization);
    if (bearer === undefined) {
      writeJson(
        res,
        401,
        { error: "Authorization Bearer token required" },
        { "www-authenticate": bearerChallenge }
      );
      return;
    }

    const requestId = newRequestId();
    const reqLogger = logger.child({ request_id: requestId, bearer_hash: bearer.hash() });

    const rate = rateLimiter.check(bearer.fullHash());
    if (!rate.allowed) {
      reqLogger.warn({ retry_after_ms: rate.retryAfterMs ?? 0 }, "http.rate_limited");
      const headers =
        rate.retryAfterMs !== undefined
          ? { "retry-after": String(Math.ceil(rate.retryAfterMs / 1000)) }
          : {};
      writeJson(res, 429, { error: "Rate limited" }, headers);
      return;
    }

    const api = createHttpApiGateway({
      baseUrl: config.apiBaseUrl,
      bearer,
      requestId,
      logger: reqLogger,
    });

    const { server, transport } = await createStatelessMcp({ api, logger: reqLogger, requestId });
    try {
      await transport.handleRequest(req, res);
      reqLogger.info({}, "http.request_done");
    } catch (cause) {
      reqLogger.error(
        { error_message: cause instanceof Error ? cause.message : "unknown" },
        "http.handler_error"
      );
      if (!res.headersSent) {
        writeJson(res, 500, { error: "Internal server error" });
      }
    } finally {
      void transport.close().catch(() => undefined);
      void server.close().catch(() => undefined);
    }
  }

  return handle;
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.from(chunk as Uint8Array);
    total += buf.length;
    if (total > MAX_BODY_BYTES) throw new Error("Request body too large");
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function parseForm(body: string): Readonly<Record<string, string>> {
  const params = new URLSearchParams(body);
  const form: Record<string, string> = {};
  for (const [key, value] of params) form[key] = value;
  return form;
}

function writeJson(
  res: ServerResponse,
  status: number,
  body: unknown,
  extraHeaders: Readonly<Record<string, string>> = {}
): void {
  res.writeHead(status, { "content-type": "application/json", ...extraHeaders });
  res.end(JSON.stringify(body));
}
