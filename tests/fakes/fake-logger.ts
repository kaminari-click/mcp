/**
 * In-memory {@link Logger} capturing every line for assertions.
 */

import type { LogFields, Logger } from "../../src/domain/ports/logger.js";

export interface LogLine {
  readonly level: string;
  readonly fields: LogFields;
  readonly message: string;
}

export interface FakeLogger extends Logger {
  readonly lines: LogLine[];
}

export function createFakeLogger(bound: LogFields = {}, sink?: LogLine[]): FakeLogger {
  const lines = sink ?? [];
  const push = (level: string, fields: LogFields, message: string): void => {
    lines.push({ level, fields: { ...bound, ...fields }, message });
  };
  return {
    lines,
    child(fields: LogFields): Logger {
      return createFakeLogger({ ...bound, ...fields }, lines);
    },
    trace: (f, m) => {
      push("trace", f, m);
    },
    debug: (f, m) => {
      push("debug", f, m);
    },
    info: (f, m) => {
      push("info", f, m);
    },
    warn: (f, m) => {
      push("warn", f, m);
    },
    error: (f, m) => {
      push("error", f, m);
    },
    fatal: (f, m) => {
      push("fatal", f, m);
    },
  };
}
