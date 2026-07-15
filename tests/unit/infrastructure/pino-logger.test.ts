import { Writable } from "node:stream";

import { describe, expect, it } from "vitest";

import { createPinoLogger } from "../../../src/infrastructure/logging/pino-logger.js";

function makeSink(): { stream: Writable; lines: () => Record<string, unknown>[] } {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _enc, cb): void {
      chunks.push(chunk.toString());
      cb();
    },
  });
  return {
    stream,
    lines: () =>
      chunks
        .join("")
        .split("\n")
        .filter((l) => l.trim().length > 0)
        .map((l) => JSON.parse(l) as Record<string, unknown>),
  };
}

describe("createPinoLogger", () => {
  it("writes structured lines at every level", () => {
    const sink = makeSink();
    const logger = createPinoLogger("trace", "json", sink.stream);
    logger.trace({ a: 1 }, "t");
    logger.debug({}, "d");
    logger.info({}, "i");
    logger.warn({}, "w");
    logger.error({}, "e");
    logger.fatal({}, "f");
    const lines = sink.lines();
    expect(lines.map((l) => l["level"])).toEqual([
      "trace",
      "debug",
      "info",
      "warn",
      "error",
      "fatal",
    ]);
    expect(lines[0]).toMatchObject({ a: 1, msg: "t" });
  });

  it("drops lines below the configured level", () => {
    const sink = makeSink();
    const logger = createPinoLogger("warn", "json", sink.stream);
    logger.info({}, "hidden");
    logger.warn({}, "shown");
    expect(sink.lines().map((l) => l["msg"])).toEqual(["shown"]);
  });

  it("binds child fields to every line", () => {
    const sink = makeSink();
    const logger = createPinoLogger("info", "json", sink.stream).child({ request_id: "r1" });
    logger.info({ tool_name: "query_stats" }, "call");
    expect(sink.lines()[0]).toMatchObject({ request_id: "r1", tool_name: "query_stats" });
  });

  it("redacts authorization fields", () => {
    const sink = makeSink();
    const logger = createPinoLogger("info", "json", sink.stream);
    logger.info({ authorization: "Bearer secret" }, "req");
    const line = sink.lines()[0]!;
    expect(line["authorization"]).toBe("[REDACTED]");
    expect(JSON.stringify(line)).not.toContain("secret");
  });

  it("builds a pretty logger without a destination (smoke)", () => {
    const logger = createPinoLogger("fatal", "pretty");
    expect(() => {
      logger.trace({}, "below level, no output");
    }).not.toThrow();
  });

  it("builds a json logger without a destination (smoke)", () => {
    const logger = createPinoLogger("fatal", "json");
    expect(() => {
      logger.trace({}, "below level, no output");
    }).not.toThrow();
  });
});
