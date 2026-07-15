/**
 * Runtime configuration — the single source of truth for env-var
 * reads. `process.env.X` anywhere else is a review blocker.
 *
 * Every variable carries the `KAMINARI_CLICK_` prefix so another
 * tool's generic `LOG_LEVEL` / `HTTP_PORT` in the same shell cannot
 * poison this process.
 */

import { z } from "zod";

import { err, ok, type Result } from "./result.js";

/** `stdio` = local one-tenant process; `http` = hosted multi-tenant. */
export const TransportSchema = z.enum(["stdio", "http"]);
export type Transport = z.infer<typeof TransportSchema>;

export const LogLevelSchema = z.enum(["trace", "debug", "info", "warn", "error", "fatal"]);
export type LogLevel = z.infer<typeof LogLevelSchema>;

export const LogFormatSchema = z.enum(["pretty", "json"]);
export type LogFormat = z.infer<typeof LogFormatSchema>;

export interface Config {
  readonly transport: Transport;
  readonly apiBaseUrl: string;
  readonly logLevel: LogLevel;
  readonly logFormat: LogFormat;
  readonly httpPort: number;
  readonly rateLimitRpm: number;
  /** Set only in stdio mode; HTTP bootstrap rejects it (tenant isolation). */
  readonly stdioApiKey: string | undefined;
  /** Public URL of the MCP endpoint (RFC 9728 `resource`). */
  readonly oauthProtectedResource: string;
  /** Public URL of this server's protected-resource metadata document. */
  readonly oauthProtectedResourceMetadataUrl: string;
  /** Issuer URL of the Authorization Server (this server in simplified mode). */
  readonly oauthIssuerUrl: string;
}

const RawSchema = z.object({
  KAMINARI_CLICK_TRANSPORT: TransportSchema.default("stdio"),
  KAMINARI_CLICK_API_URL: z.string().url().default("https://kaminari.click"),
  KAMINARI_CLICK_LOG_LEVEL: LogLevelSchema.default("info"),
  KAMINARI_CLICK_LOG_FORMAT: LogFormatSchema.optional(),
  KAMINARI_CLICK_HTTP_PORT: z.coerce.number().int().min(0).max(65535).default(8080),
  KAMINARI_CLICK_RATE_LIMIT_RPM: z.coerce.number().int().min(1).max(10_000).default(120),
  KAMINARI_CLICK_API_KEY: z.string().min(8).optional(),
  KAMINARI_CLICK_OAUTH_RESOURCE: z.string().url().default("https://mcp.kaminari.click/mcp"),
  KAMINARI_CLICK_OAUTH_RESOURCE_METADATA_URL: z
    .string()
    .url()
    .default("https://mcp.kaminari.click/.well-known/oauth-protected-resource"),
  KAMINARI_CLICK_OAUTH_ISSUER_URL: z.string().url().default("https://mcp.kaminari.click"),
});

export interface ConfigError {
  readonly kind: "invalid";
  readonly issues: Readonly<Record<string, readonly string[] | undefined>>;
}

/**
 * Parse env vars into a {@link Config}. `LOG_FORMAT` defaults to
 * `pretty` for stdio (human terminal) and `json` for http (log
 * aggregators); an explicit env var wins.
 */
export function loadConfig(env: NodeJS.ProcessEnv): Result<Config, ConfigError> {
  const parsed = RawSchema.safeParse(env);
  if (!parsed.success) {
    return err({ kind: "invalid", issues: parsed.error.flatten().fieldErrors });
  }
  const raw = parsed.data;
  const transport = raw.KAMINARI_CLICK_TRANSPORT;
  return ok({
    transport,
    apiBaseUrl: raw.KAMINARI_CLICK_API_URL,
    logLevel: raw.KAMINARI_CLICK_LOG_LEVEL,
    logFormat: raw.KAMINARI_CLICK_LOG_FORMAT ?? (transport === "stdio" ? "pretty" : "json"),
    httpPort: raw.KAMINARI_CLICK_HTTP_PORT,
    rateLimitRpm: raw.KAMINARI_CLICK_RATE_LIMIT_RPM,
    stdioApiKey: raw.KAMINARI_CLICK_API_KEY,
    oauthProtectedResource: raw.KAMINARI_CLICK_OAUTH_RESOURCE,
    oauthProtectedResourceMetadataUrl: raw.KAMINARI_CLICK_OAUTH_RESOURCE_METADATA_URL,
    oauthIssuerUrl: raw.KAMINARI_CLICK_OAUTH_ISSUER_URL,
  });
}
