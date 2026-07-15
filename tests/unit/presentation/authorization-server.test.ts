import { describe, expect, it } from "vitest";

import {
  type AuthorizationServer,
  createAuthorizationServer,
} from "../../../src/presentation/http/oauth/authorization-server.js";
import { computeS256Challenge } from "../../../src/presentation/http/oauth/pkce.js";
import { createFakeClock, type FakeClock } from "../../fakes/fake-clock.js";

const ISSUER = "https://mcp.example.com";
const REDIRECT = "https://client.example.com/callback";
const VERIFIER = "verifier-string-that-is-long-enough";

function makeServer(): { server: AuthorizationServer; clock: FakeClock } {
  const clock = createFakeClock();
  return { server: createAuthorizationServer({ issuerUrl: `${ISSUER}/`, clock }), clock };
}

function authorize(server: AuthorizationServer, overrides: Record<string, string> = {}): string {
  const result = server.submitAuthorize({
    client_id: "client-1",
    redirect_uri: REDIRECT,
    state: "st4te",
    code_challenge: computeS256Challenge(VERIFIER),
    code_challenge_method: "S256",
    token: "my-api-token-value",
    ...overrides,
  });
  if (result.kind !== "redirect") throw new Error(`expected redirect, got ${result.message}`);
  return new URL(result.location).searchParams.get("code") ?? "";
}

describe("authorization server metadata", () => {
  it("builds RFC 8414 metadata with trimmed issuer", () => {
    const { server } = makeServer();
    expect(server.buildAuthorizationServerMetadata()).toEqual({
      issuer: ISSUER,
      authorization_endpoint: `${ISSUER}/authorize`,
      token_endpoint: `${ISSUER}/token`,
      registration_endpoint: `${ISSUER}/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
    });
  });

  it("builds RFC 9728 protected-resource metadata", () => {
    const { server } = makeServer();
    expect(server.buildProtectedResourceMetadata("https://mcp.example.com/mcp", "unused")).toEqual({
      resource: "https://mcp.example.com/mcp",
      authorization_servers: [ISSUER],
      bearer_methods_supported: ["header"],
    });
  });
});

describe("dynamic client registration", () => {
  it("registers a client with valid redirect uris", () => {
    const { server } = makeServer();
    const result = server.register({ redirect_uris: [REDIRECT] });
    expect(result.status).toBe(201);
    expect(result.body["client_id"]).toBeTruthy();
    expect(result.body["token_endpoint_auth_method"]).toBe("none");
  });

  it("accepts localhost http and custom schemes", () => {
    const { server } = makeServer();
    expect(
      server.register({ redirect_uris: ["http://localhost:3000/cb", "cursor://oauth"] }).status
    ).toBe(201);
    expect(server.register({ redirect_uris: ["http://127.0.0.1/cb"] }).status).toBe(201);
  });

  it("rejects missing, invalid, http-non-localhost and javascript uris", () => {
    const { server } = makeServer();
    expect(server.register({}).status).toBe(400);
    expect(server.register(null).status).toBe(400);
    expect(server.register({ redirect_uris: ["not a url"] }).status).toBe(400);
    expect(server.register({ redirect_uris: ["http://evil.com/cb"] }).status).toBe(400);
    expect(server.register({ redirect_uris: ["javascript:alert(1)"] }).status).toBe(400);
    expect(server.register({ redirect_uris: [42] }).status).toBe(400);
  });
});

describe("authorize page", () => {
  const validQuery = {
    response_type: "code",
    client_id: "client-1",
    redirect_uri: REDIRECT,
    state: "st4te",
    code_challenge: computeS256Challenge(VERIFIER),
    code_challenge_method: "S256",
  };

  it("renders the token form with hidden fields", () => {
    const { server } = makeServer();
    const page = server.renderAuthorizePage(validQuery);
    expect(page.status).toBe(200);
    expect(page.html).toContain('name="token"');
    expect(page.html).toContain('value="st4te"');
    expect(page.html).toContain("Connect Kaminari Click");
  });

  it("escapes HTML in echoed parameters", () => {
    const { server } = makeServer();
    const page = server.renderAuthorizePage({ ...validQuery, state: '"><script>x</script>' });
    expect(page.html).not.toContain("<script>x</script>");
    expect(page.html).toContain("&lt;script&gt;");
  });

  it("renders without a state parameter", () => {
    const { server } = makeServer();
    const page = server.renderAuthorizePage({
      response_type: validQuery.response_type,
      client_id: validQuery.client_id,
      redirect_uri: validQuery.redirect_uri,
      code_challenge: validQuery.code_challenge,
      code_challenge_method: validQuery.code_challenge_method,
    });
    expect(page.status).toBe(200);
    expect(page.html).toContain('name="state" value=""');
  });

  it("rejects invalid queries", () => {
    const { server } = makeServer();
    expect(server.renderAuthorizePage({ ...validQuery, response_type: "token" }).status).toBe(400);
    expect(server.renderAuthorizePage({ ...validQuery, client_id: "" }).status).toBe(400);
    expect(server.renderAuthorizePage({ ...validQuery, redirect_uri: "javascript:x" }).status).toBe(
      400
    );
    expect(server.renderAuthorizePage({ ...validQuery, code_challenge: "" }).status).toBe(400);
    expect(
      server.renderAuthorizePage({ ...validQuery, code_challenge_method: "plain" }).status
    ).toBe(400);
  });
});

describe("authorize submit", () => {
  it("redirects with code and state", () => {
    const { server } = makeServer();
    const result = server.submitAuthorize({
      client_id: "client-1",
      redirect_uri: REDIRECT,
      state: "st4te",
      code_challenge: computeS256Challenge(VERIFIER),
      code_challenge_method: "S256",
      token: "my-api-token-value",
    });
    expect(result.kind).toBe("redirect");
    if (result.kind !== "redirect") return;
    const url = new URL(result.location);
    expect(url.origin + url.pathname).toBe(REDIRECT);
    expect(url.searchParams.get("code")).toBeTruthy();
    expect(url.searchParams.get("state")).toBe("st4te");
  });

  it("omits state when empty", () => {
    const { server } = makeServer();
    const result = server.submitAuthorize({
      client_id: "client-1",
      redirect_uri: REDIRECT,
      state: "",
      code_challenge: computeS256Challenge(VERIFIER),
      code_challenge_method: "S256",
      token: "my-api-token-value",
    });
    if (result.kind !== "redirect") throw new Error("expected redirect");
    expect(new URL(result.location).searchParams.has("state")).toBe(false);
  });

  it("rejects a too-short token and invalid request fields", () => {
    const { server } = makeServer();
    const base = {
      client_id: "client-1",
      redirect_uri: REDIRECT,
      code_challenge: computeS256Challenge(VERIFIER),
      code_challenge_method: "S256",
    };
    expect(server.submitAuthorize({ ...base, token: "short" }).kind).toBe("error");
    expect(server.submitAuthorize({ ...base, token: "" }).kind).toBe("error");
    expect(
      server.submitAuthorize({ ...base, token: "long-enough-token", redirect_uri: "bad" }).kind
    ).toBe("error");
  });
});

describe("pending-code cap", () => {
  it("evicts the oldest code beyond maxPendingCodes", () => {
    const clock = createFakeClock();
    const server = createAuthorizationServer({ issuerUrl: ISSUER, clock, maxPendingCodes: 2 });
    const first = authorize(server);
    const second = authorize(server);
    const third = authorize(server); // sweeping happens on the next submit
    authorize(server);
    // `first` was evicted by the cap; newer codes still work.
    expect(
      server.exchangeToken({
        grant_type: "authorization_code",
        code: first,
        code_verifier: VERIFIER,
      })
    ).toMatchObject({ kind: "error", error: "invalid_grant" });
    expect(
      server.exchangeToken({
        grant_type: "authorization_code",
        code: third,
        code_verifier: VERIFIER,
      }).kind
    ).toBe("ok");
    void second;
  });
});

describe("token exchange", () => {
  it("returns the pasted API token for a valid code + verifier", () => {
    const { server } = makeServer();
    const code = authorize(server);
    const result = server.exchangeToken({
      grant_type: "authorization_code",
      code,
      code_verifier: VERIFIER,
      redirect_uri: REDIRECT,
    });
    expect(result).toEqual({ kind: "ok", accessToken: "my-api-token-value" });
  });

  it("accepts a request without redirect_uri (public client)", () => {
    const { server } = makeServer();
    const code = authorize(server);
    expect(
      server.exchangeToken({ grant_type: "authorization_code", code, code_verifier: VERIFIER }).kind
    ).toBe("ok");
  });

  it("rejects unsupported grant types", () => {
    const { server } = makeServer();
    const result = server.exchangeToken({ grant_type: "client_credentials" });
    expect(result).toMatchObject({ kind: "error", error: "unsupported_grant_type" });
  });

  it("rejects unknown and reused codes", () => {
    const { server } = makeServer();
    expect(
      server.exchangeToken({ grant_type: "authorization_code", code: "nope", code_verifier: "v" })
    ).toMatchObject({ kind: "error", error: "invalid_grant" });
    const code = authorize(server);
    server.exchangeToken({ grant_type: "authorization_code", code, code_verifier: VERIFIER });
    expect(
      server.exchangeToken({ grant_type: "authorization_code", code, code_verifier: VERIFIER })
    ).toMatchObject({ kind: "error", error: "invalid_grant" });
  });

  it("rejects expired codes", () => {
    const { server, clock } = makeServer();
    const code = authorize(server);
    clock.advance(6 * 60 * 1000);
    expect(
      server.exchangeToken({ grant_type: "authorization_code", code, code_verifier: VERIFIER })
    ).toMatchObject({ kind: "error", error: "invalid_grant" });
  });

  it("rejects a mismatched redirect_uri", () => {
    const { server } = makeServer();
    const code = authorize(server);
    expect(
      server.exchangeToken({
        grant_type: "authorization_code",
        code,
        code_verifier: VERIFIER,
        redirect_uri: "https://other.example.com/cb",
      })
    ).toMatchObject({ kind: "error", error: "invalid_grant" });
  });

  it("rejects a failed or missing PKCE verifier", () => {
    const { server } = makeServer();
    const code1 = authorize(server);
    expect(
      server.exchangeToken({
        grant_type: "authorization_code",
        code: code1,
        code_verifier: "wrong-verifier",
      })
    ).toMatchObject({ kind: "error", error: "invalid_grant" });
    const code2 = authorize(server);
    expect(server.exchangeToken({ grant_type: "authorization_code", code: code2 })).toMatchObject({
      kind: "error",
      error: "invalid_grant",
    });
  });
});
