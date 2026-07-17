/**
 * Composition root for the HTTP transport. Wires the long-lived
 * per-process dependencies (logger, rate limiter, OAuth server) and
 * hands per-request handling to {@link createHttpRequestHandler}.
 *
 * Tenant-isolation invariant: `KAMINARI_CLICK_API_KEY` is rejected in
 * HTTP mode so the process can never serve a default-Bearer fallback.
 */

import { createServer } from "node:http";
import process from "node:process";

import { createSystemClock } from "../../infrastructure/clock/system-clock.js";
import { createPinoLogger } from "../../infrastructure/logging/pino-logger.js";
import { createLeakyBucketRateLimiter } from "../../infrastructure/rate-limit/leaky-bucket-rate-limiter.js";
import type { Config } from "../../shared/config.js";
import { createHttpRequestHandler } from "./http-request-handler.js";
import { createAuthorizationServer } from "./oauth/authorization-server.js";

/** Build and start the HTTP MCP server; resolves with an exit code. */
export async function bootstrapHttp(config: Config): Promise<number> {
  const logger = createPinoLogger(config.logLevel, config.logFormat);

  if (config.stdioApiKey !== undefined) {
    logger.fatal({}, "http.api_key_env_forbidden");
    return 2;
  }

  const clock = createSystemClock();
  const rateLimiter = createLeakyBucketRateLimiter(clock, config.rateLimitRpm);
  const authServer = createAuthorizationServer({
    issuerUrl: config.oauthIssuerUrl,
    clock,
    ...(config.jwtKey !== undefined ? { jwtKey: config.jwtKey } : {}),
    jwtAlg: config.jwtAlg,
  });

  const handle = createHttpRequestHandler({ config, logger, rateLimiter, authServer });

  const httpServer = createServer((req, res) => {
    res.setHeader("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    handle(req, res).catch((cause: unknown) => {
      logger.error(
        { error_message: cause instanceof Error ? cause.message : String(cause) },
        "http.unhandled"
      );
      if (!res.headersSent) {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "Internal server error" }));
      }
    });
  });

  await new Promise<void>((resolve) => {
    httpServer.listen(config.httpPort, () => {
      logger.info({ http_port: config.httpPort }, "http.ready");
      resolve();
    });
  });

  await new Promise<void>((resolve) => {
    const onSignal = (): void => {
      logger.info({}, "http.shutdown");
      httpServer.close(() => {
        resolve();
      });
    };
    process.once("SIGTERM", onSignal);
    process.once("SIGINT", onSignal);
  });
  return 0;
}
