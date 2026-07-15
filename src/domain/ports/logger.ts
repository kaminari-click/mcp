/**
 * Structured logging port — the only logging channel in `src/`
 * (`console.*` is banned by ESLint; stdout is the MCP JSON-RPC
 * channel in stdio mode).
 *
 * Bearer tokens MUST NOT appear in any log line; the `BearerToken`
 * value object self-redacts.
 */

export type LogFields = Readonly<Record<string, string | number | boolean | undefined>>;

export interface Logger {
  /** Returns a logger including `fields` on every subsequent line. */
  child(fields: LogFields): Logger;

  trace(fields: LogFields, message: string): void;
  debug(fields: LogFields, message: string): void;
  info(fields: LogFields, message: string): void;
  warn(fields: LogFields, message: string): void;
  error(fields: LogFields, message: string): void;
  fatal(fields: LogFields, message: string): void;
}
