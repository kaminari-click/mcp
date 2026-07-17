/**
 * Tenant-isolation and protocol tests for the HTTP transport, run
 * against a real `node:http` server wired with fakes where needed and
 * a stub Kaminari Click API upstream.
 */

import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { RateLimiter } from "../../src/domain/ports/rate-limiter.js";
import { createHttpRequestHandler } from "../../src/presentation/http/http-request-handler.js";
import { createAuthorizationServer } from "../../src/presentation/http/oauth/authorization-server.js";
import { computeS256Challenge } from "../../src/presentation/http/oauth/pkce.js";
import type { Config } from "../../src/shared/config.js";
import { createFakeClock } from "../fakes/fake-clock.js";
import { createFakeLogger } from "../fakes/fake-logger.js";
import { signAgentJwt } from "../fakes/sign-jwt.js";

const JWT_KEY = "isolation-test-secret";
const TENANT_A = signAgentJwt(1, JWT_KEY);
const TENANT_B = signAgentJwt(2, JWT_KEY);

let upstream: Server;
let upstreamUrl = "";
let upstreamRequests: { url: string; authorization: string | undefined }[] = [];

let mcpServer: Server;
let mcpUrl = "";
let rateLimiterAllow = true;
let rateLimiterRetryAfter: number | undefined = 1500;

beforeAll(async () => {
  upstream = createServer((req, res) => {
    upstreamRequests.push({ url: req.url ?? "", authorization: req.headers.authorization });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        code: 200,
        data: { groups: { time: [{ id: "time_day" }] }, metrics: { bots: [{ id: "bots_total" }] } },
      })
    );
  });
  await new Promise<void>((resolve) => {
    upstream.listen(0, () => {
      resolve();
    });
  });
  upstreamUrl = `http://127.0.0.1:${String((upstream.address() as AddressInfo).port)}`;

  const config: Config = {
    transport: "http",
    apiBaseUrl: upstreamUrl,
    logLevel: "fatal",
    logFormat: "json",
    httpPort: 0,
    rateLimitRpm: 120,
    stdioApiKey: undefined,
    jwtKey: JWT_KEY,
    jwtAlg: "HS256",
    oauthProtectedResource: "https://mcp.example.com/mcp",
    oauthProtectedResourceMetadataUrl:
      "https://mcp.example.com/.well-known/oauth-protected-resource",
    oauthIssuerUrl: "https://mcp.example.com",
  };
  const rateLimiter: RateLimiter = {
    check: () =>
      rateLimiterAllow
        ? { allowed: true }
        : {
            allowed: false,
            ...(rateLimiterRetryAfter !== undefined ? { retryAfterMs: rateLimiterRetryAfter } : {}),
          },
  };
  const handler = createHttpRequestHandler({
    config,
    logger: createFakeLogger(),
    rateLimiter,
    authServer: createAuthorizationServer({
      issuerUrl: config.oauthIssuerUrl,
      clock: createFakeClock(),
      jwtKey: JWT_KEY,
    }),
  });
  // Mirror the bootstrap's top-level catch (e.g. oversized bodies).
  mcpServer = createServer((req, res) => {
    handler(req, res).catch(() => {
      if (!res.headersSent) {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "Internal server error" }));
      }
    });
  });
  await new Promise<void>((resolve) => {
    mcpServer.listen(0, () => {
      resolve();
    });
  });
  mcpUrl = `http://127.0.0.1:${String((mcpServer.address() as AddressInfo).port)}`;
});

afterAll(async () => {
  await new Promise((resolve) => upstream.close(resolve));
  await new Promise((resolve) => mcpServer.close(resolve));
});

describe("public endpoints (no auth)", () => {
  it("serves /healthz", async () => {
    const res = await fetch(`${mcpUrl}/healthz`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("serves protected-resource metadata", async () => {
    const res = await fetch(`${mcpUrl}/.well-known/oauth-protected-resource`);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("max-age=3600");
    expect(await res.json()).toEqual({
      resource: "https://mcp.example.com/mcp",
      authorization_servers: ["https://mcp.example.com"],
      bearer_methods_supported: ["header"],
    });
  });

  it("serves authorization-server metadata", async () => {
    const res = await fetch(`${mcpUrl}/.well-known/oauth-authorization-server`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body["issuer"]).toBe("https://mcp.example.com");
    expect(body["code_challenge_methods_supported"]).toEqual(["S256"]);
  });

  it("returns 404 for unknown paths and wrong methods", async () => {
    expect((await fetch(`${mcpUrl}/nope`)).status).toBe(404);
    expect((await fetch(`${mcpUrl}/mcp`, { method: "PATCH" })).status).toBe(404);
  });
});

describe("tenant isolation", () => {
  it("rejects /mcp without a Bearer and advertises resource metadata", async () => {
    const res = await fetch(`${mcpUrl}/mcp`, { method: "POST" });
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toBe(
      'Bearer resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource"'
    );
  });

  it("rejects malformed Authorization headers", async () => {
    const res = await fetch(`${mcpUrl}/mcp`, {
      method: "POST",
      headers: { authorization: "Basic dXNlcg==" },
    });
    expect(res.status).toBe(401);
  });

  it("rejects a personal API JWT without isAgent", async () => {
    const { signPersonalJwt } = await import("../fakes/sign-jwt.js");
    const res = await fetch(`${mcpUrl}/mcp`, {
      method: "POST",
      headers: { authorization: `Bearer ${signPersonalJwt(1, JWT_KEY)}` },
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({
      error: expect.stringContaining("MCP / Agent token"),
    });
  });

  it("returns 429 with Retry-After when the limiter denies", async () => {
    rateLimiterAllow = false;
    const res = await fetch(`${mcpUrl}/mcp`, {
      method: "POST",
      headers: { authorization: `Bearer ${TENANT_A}` },
    });
    rateLimiterAllow = true;
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("2");
  });

  it("returns 429 without Retry-After when the limiter has no hint", async () => {
    rateLimiterAllow = false;
    rateLimiterRetryAfter = undefined;
    const res = await fetch(`${mcpUrl}/mcp`, {
      method: "POST",
      headers: { authorization: `Bearer ${TENANT_A}` },
    });
    rateLimiterAllow = true;
    rateLimiterRetryAfter = 1500;
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBeNull();
  });

  it("rejects a GET /authorize without any parameters", async () => {
    const res = await fetch(`${mcpUrl}/authorize`);
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("Invalid request");
  });

  it("serves a stateless MCP request end-to-end with the caller's own Bearer", async () => {
    upstreamRequests = [];
    const init = await fetch(`${mcpUrl}/mcp`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${TENANT_A}`,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "test", version: "0.0.0" },
        },
      }),
    });
    expect(init.status).toBe(200);
    // Stateless: no session id issued.
    expect(init.headers.get("mcp-session-id")).toBeNull();
    const initBody = (await init.json()) as {
      result: { serverInfo: { name: string }; instructions: string };
    };
    expect(initBody.result.serverInfo.name).toBe("@kaminari-click/mcp");

    const call = await fetch(`${mcpUrl}/mcp`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${TENANT_A}`,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "list_stat_fields", arguments: {} },
      }),
    });
    expect(call.status).toBe(200);
    const callBody = (await call.json()) as {
      result: { structuredContent: { groups: Record<string, unknown> } };
    };
    expect(callBody.result.structuredContent.groups).toHaveProperty("time");

    // The upstream saw exactly this tenant's Bearer, never anything else.
    expect(upstreamRequests).toHaveLength(1);
    expect(upstreamRequests[0]!.authorization).toBe(`Bearer ${TENANT_A}`);
    expect(upstreamRequests[0]!.url).toBe("/api/stat/get");
  });

  it("answers resources/list and prompts/list with empty arrays", async () => {
    const call = async (method: string): Promise<unknown> => {
      const res = await fetch(`${mcpUrl}/mcp`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${TENANT_A}`,
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 9, method, params: {} }),
      });
      return ((await res.json()) as { result: unknown }).result;
    };
    expect(await call("resources/list")).toEqual({ resources: [] });
    expect(await call("prompts/list")).toEqual({ prompts: [] });
  });

  it("rejects oversized OAuth bodies", async () => {
    const res = await fetch(`${mcpUrl}/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: `{"pad":"${"x".repeat(1024 * 1024 + 100)}"}`,
    });
    expect(res.status).toBe(500);
  });

  it("lists all 11 tools over HTTP", async () => {
    const res = await fetch(`${mcpUrl}/mcp`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${TENANT_B}`,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/list", params: {} }),
    });
    const body = (await res.json()) as { result: { tools: { name: string }[] } };
    expect(body.result.tools).toHaveLength(11);
  });
});

describe("OAuth flow over HTTP", () => {
  it("completes register -> authorize -> token and returns the pasted API token", async () => {
    const reg = await fetch(`${mcpUrl}/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ redirect_uris: ["https://chat.example.com/cb"] }),
    });
    expect(reg.status).toBe(201);
    const { client_id } = (await reg.json()) as { client_id: string };

    const verifier = "test-verifier-string-with-enough-entropy";
    const challenge = computeS256Challenge(verifier);
    const page = await fetch(
      `${mcpUrl}/authorize?response_type=code&client_id=${client_id}` +
        `&redirect_uri=${encodeURIComponent("https://chat.example.com/cb")}` +
        `&state=xyz&code_challenge=${challenge}&code_challenge_method=S256`
    );
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('name="token"');

    const form = new URLSearchParams({
      token: TENANT_A,
      client_id,
      redirect_uri: "https://chat.example.com/cb",
      state: "xyz",
      code_challenge: challenge,
      code_challenge_method: "S256",
    });
    const submit = await fetch(`${mcpUrl}/authorize`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form.toString(),
      redirect: "manual",
    });
    expect(submit.status).toBe(302);
    const location = new URL(submit.headers.get("location")!);
    expect(location.searchParams.get("state")).toBe("xyz");
    const code = location.searchParams.get("code")!;

    const token = await fetch(`${mcpUrl}/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        code_verifier: verifier,
        redirect_uri: "https://chat.example.com/cb",
        client_id,
      }).toString(),
    });
    expect(token.status).toBe(200);
    expect(token.headers.get("cache-control")).toBe("no-store");
    expect(await token.json()).toEqual({
      access_token: TENANT_A,
      token_type: "Bearer",
    });
  });

  it("renders an error page for a bad authorize submit", async () => {
    const submit = await fetch(`${mcpUrl}/authorize`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: "short" }).toString(),
    });
    expect(submit.status).toBe(400);
    expect(await submit.text()).toContain("Error");
  });

  it("rejects a token exchange with a bad grant type", async () => {
    const token = await fetch(`${mcpUrl}/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "password" }).toString(),
    });
    expect(token.status).toBe(400);
    expect(((await token.json()) as { error: string }).error).toBe("unsupported_grant_type");
  });

  it("rejects malformed registration JSON", async () => {
    const reg = await fetch(`${mcpUrl}/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });
    expect(reg.status).toBe(400);
  });

  it("registers with an empty body as invalid", async () => {
    const reg = await fetch(`${mcpUrl}/register`, { method: "POST" });
    expect(reg.status).toBe(400);
  });
});
