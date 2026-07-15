import { describe, expect, it } from "vitest";

import { loadConfig } from "../../../src/shared/config.js";

describe("loadConfig", () => {
  it("applies defaults with an empty env", () => {
    const result = loadConfig({});
    expect(result.isOk()).toBe(true);
    const config = result._unsafeUnwrap();
    expect(config.transport).toBe("stdio");
    expect(config.apiBaseUrl).toBe("https://kaminari.click");
    expect(config.logLevel).toBe("info");
    expect(config.logFormat).toBe("pretty");
    expect(config.httpPort).toBe(8080);
    expect(config.rateLimitRpm).toBe(120);
    expect(config.stdioApiKey).toBeUndefined();
  });

  it("defaults logFormat to json for http transport", () => {
    const config = loadConfig({ KAMINARI_CLICK_TRANSPORT: "http" })._unsafeUnwrap();
    expect(config.logFormat).toBe("json");
  });

  it("lets an explicit LOG_FORMAT win over the transport default", () => {
    const config = loadConfig({
      KAMINARI_CLICK_TRANSPORT: "http",
      KAMINARI_CLICK_LOG_FORMAT: "pretty",
    })._unsafeUnwrap();
    expect(config.logFormat).toBe("pretty");
  });

  it("parses all overrides", () => {
    const config = loadConfig({
      KAMINARI_CLICK_TRANSPORT: "http",
      KAMINARI_CLICK_API_URL: "https://staging.kaminari.click",
      KAMINARI_CLICK_LOG_LEVEL: "debug",
      KAMINARI_CLICK_HTTP_PORT: "9090",
      KAMINARI_CLICK_RATE_LIMIT_RPM: "60",
      KAMINARI_CLICK_API_KEY: "secret-token-value",
      KAMINARI_CLICK_OAUTH_RESOURCE: "https://example.com/mcp",
      KAMINARI_CLICK_OAUTH_RESOURCE_METADATA_URL:
        "https://example.com/.well-known/oauth-protected-resource",
      KAMINARI_CLICK_OAUTH_ISSUER_URL: "https://example.com",
    })._unsafeUnwrap();
    expect(config.apiBaseUrl).toBe("https://staging.kaminari.click");
    expect(config.logLevel).toBe("debug");
    expect(config.httpPort).toBe(9090);
    expect(config.rateLimitRpm).toBe(60);
    expect(config.stdioApiKey).toBe("secret-token-value");
    expect(config.oauthIssuerUrl).toBe("https://example.com");
  });

  it("rejects an invalid transport", () => {
    const result = loadConfig({ KAMINARI_CLICK_TRANSPORT: "websocket" });
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().kind).toBe("invalid");
    expect(Object.keys(result._unsafeUnwrapErr().issues)).toContain("KAMINARI_CLICK_TRANSPORT");
  });

  it("rejects an out-of-range port", () => {
    expect(loadConfig({ KAMINARI_CLICK_HTTP_PORT: "70000" }).isErr()).toBe(true);
  });

  it("rejects a too-short api key", () => {
    expect(loadConfig({ KAMINARI_CLICK_API_KEY: "short" }).isErr()).toBe(true);
  });
});
