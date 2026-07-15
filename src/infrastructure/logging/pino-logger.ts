/**
 * Production {@link Logger} adapter backed by pino.
 *
 * Bearers never log: pino redaction covers the known header fields,
 * and both formats write to **stderr** so stdout stays a pure MCP
 * JSON-RPC channel in stdio mode.
 */

import { type Logger as PinoLoggerImpl, type LoggerOptions, pino, stdTimeFunctions } from "pino";
import pinoPretty from "pino-pretty";

import type { LogFields, Logger } from "../../domain/ports/logger.js";
import type { LogFormat, LogLevel } from "../../shared/config.js";

const REDACTION_PATHS: readonly string[] = [
  "authorization",
  "Authorization",
  "bearer",
  "Bearer",
  "*.authorization",
  "*.Authorization",
  "headers.authorization",
  "headers.Authorization",
];

/**
 * Build a pino-backed `Logger`. In `pretty` mode pino-pretty is used
 * as a synchronous stream (NOT pino's worker transport, which would
 * default to stdout and corrupt the MCP channel).
 */
export function createPinoLogger(
  level: LogLevel,
  format: LogFormat = "json",
  destination?: NodeJS.WritableStream
): Logger {
  const options: LoggerOptions = {
    level,
    redact: { paths: [...REDACTION_PATHS], censor: "[REDACTED]" },
    base: null,
    timestamp: stdTimeFunctions.isoTime,
    formatters: { level: (label) => ({ level: label }) },
  };
  const sink =
    destination ??
    (format === "pretty"
      ? pinoPretty({
          colorize: true,
          ignore: "pid,hostname",
          destination: process.stderr.fd,
          sync: true,
        })
      : pino.destination(process.stderr.fd));
  return wrap(pino(options, sink));
}

function wrap(impl: PinoLoggerImpl): Logger {
  return {
    child(fields: LogFields): Logger {
      return wrap(impl.child({ ...fields }));
    },
    trace(fields, message): void {
      impl.trace({ ...fields }, message);
    },
    debug(fields, message): void {
      impl.debug({ ...fields }, message);
    },
    info(fields, message): void {
      impl.info({ ...fields }, message);
    },
    warn(fields, message): void {
      impl.warn({ ...fields }, message);
    },
    error(fields, message): void {
      impl.error({ ...fields }, message);
    },
    fatal(fields, message): void {
      impl.fatal({ ...fields }, message);
    },
  };
}
