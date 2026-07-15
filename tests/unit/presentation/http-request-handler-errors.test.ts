/**
 * Error-path tests for the HTTP request handler with a mocked
 * stateless-MCP factory, covering the transport-crash branch that
 * cannot be triggered through a real MCP transport.
 */

import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Config } from "../../../src/shared/config.js";
import { createFakeClock } from "../../fakes/fake-clock.js";
import { createFakeLogger } from "../../fakes/fake-logger.js";

vi.mock("../../../src/presentation/http/create-stateless-mcp.js", () => ({
  createStatelessMcp: vi.fn(),
}));

const { createStatelessMcp } = await import(
  "../../../src/presentation/http/create-stateless-mcp.js"
);
const { createHttpRequestHandler } = await import(
  "../../../src/presentation/http/http-request-handler.js"
);
const { createAuthorizationServer } = await import(
  "../../../src/presentation/http/oauth/authorization-server.js"
);

const config: Config = {
  transport: "http",
  apiBaseUrl: "https://api.test",
  logLevel: "fatal",
  logFormat: "json",
  httpPort: 0,
  rateLimitRpm: 120,
  stdioApiKey: undefined,
  oauthProtectedResource: "https://mcp.example.com/mcp",
  oauthProtectedResourceMetadataUrl: "https://mcp.example.com/.well-known/oauth-protected-resource",
  oauthIssuerUrl: "https://mcp.example.com",
};

interface FakeRes {
  statusCode: number | undefined;
  headersSent: boolean;
  body: string;
  writeHead: (status: number, headers?: Record<string, string>) => void;
  end: (body?: string) => void;
  setHeader: () => void;
}

function makeReq(method: string, url: string, headers: Record<string, string>): IncomingMessage {
  const req = new EventEmitter() as unknown as IncomingMessage & EventEmitter;
  Object.assign(req, { method, url, headers });
  return req;
}

function makeRes(): FakeRes {
  const res: FakeRes = {
    statusCode: undefined,
    headersSent: false,
    body: "",
    writeHead(status: number): void {
      res.statusCode = status;
      res.headersSent = true;
    },
    end(body?: string): void {
      res.body = body ?? "";
    },
    setHeader(): void {
      // headers are irrelevant for these assertions
    },
  };
  return res;
}

function makeHandler(): ReturnType<typeof createHttpRequestHandler> {
  return createHttpRequestHandler({
    config,
    logger: createFakeLogger(),
    rateLimiter: { check: () => ({ allowed: true }) },
    authServer: createAuthorizationServer({
      issuerUrl: config.oauthIssuerUrl,
      clock: createFakeClock(),
    }),
  });
}

beforeEach(() => {
  vi.mocked(createStatelessMcp).mockReset();
});

describe("http-request-handler error paths", () => {
  it("responds 500 and closes both halves when the transport crashes", async () => {
    const close = vi.fn().mockRejectedValue(new Error("close failed"));
    vi.mocked(createStatelessMcp).mockResolvedValue({
      server: { close } as never,
      transport: {
        close,
        handleRequest: vi.fn().mockRejectedValue(new Error("transport boom")),
      } as never,
    });
    const handler = makeHandler();
    const res = makeRes();
    await handler(
      makeReq("POST", "/mcp", { authorization: "Bearer tenant-token" }),
      res as unknown as ServerResponse
    );
    expect(res.statusCode).toBe(500);
    expect(close).toHaveBeenCalledTimes(2);
  });

  it("does not double-write when headers were already sent", async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    vi.mocked(createStatelessMcp).mockResolvedValue({
      server: { close } as never,
      transport: {
        close,
        handleRequest: vi.fn().mockImplementation((_req: unknown, res: FakeRes) => {
          res.writeHead(200);
          return Promise.reject(new Error("late boom"));
        }),
      } as never,
    });
    const handler = makeHandler();
    const res = makeRes();
    await handler(
      makeReq("POST", "/mcp", { authorization: "Bearer tenant-token" }),
      res as unknown as ServerResponse
    );
    expect(res.statusCode).toBe(200);
  });

  it("handles a throwing non-Error cause", async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    vi.mocked(createStatelessMcp).mockResolvedValue({
      server: { close } as never,
      transport: {
        close,
        handleRequest: vi.fn().mockImplementation(() => {
          // eslint-disable-next-line @typescript-eslint/only-throw-error
          throw "string cause";
        }),
      } as never,
    });
    const handler = makeHandler();
    const res = makeRes();
    await handler(
      makeReq("POST", "/mcp", { authorization: "Bearer tenant-token" }),
      res as unknown as ServerResponse
    );
    expect(res.statusCode).toBe(500);
  });

  it("defaults a missing method/url to GET /", async () => {
    const handler = makeHandler();
    const res = makeRes();
    const req = makeReq("GET", "/healthz", {});
    Object.assign(req, { method: undefined, url: undefined });
    await handler(req, res as unknown as ServerResponse);
    expect(res.statusCode).toBe(404);
  });
});
