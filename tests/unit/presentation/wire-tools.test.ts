import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it } from "vitest";

import {
  formatToolError,
  wireToolsIntoMcpServer,
} from "../../../src/presentation/shared/wire-tools.js";
import { declareEmptyResourcesAndPrompts } from "../../../src/presentation/shared/declare-empty-caps.js";
import { apiError } from "../../fakes/fake-api-gateway.js";
import { makeToolContext } from "../../fakes/make-tool-context.js";

interface RegisteredTool {
  callback: (
    args: unknown,
    extra: unknown
  ) => Promise<{
    isError?: boolean;
    content: { type: string; text: string }[];
    structuredContent?: unknown;
  }>;
  config: { description: string; annotations: Record<string, unknown> };
}

function wireIntoStub(): Map<string, RegisteredTool> {
  const registered = new Map<string, RegisteredTool>();
  const serverStub = {
    registerTool(
      name: string,
      config: RegisteredTool["config"],
      callback: RegisteredTool["callback"]
    ): void {
      registered.set(name, { callback, config });
    },
  } as unknown as McpServer;
  const { ctx } = makeToolContext();
  wireToolsIntoMcpServer(serverStub, () => ctx);
  return registered;
}

describe("wireToolsIntoMcpServer", () => {
  it("registers all tools with descriptions and annotations", () => {
    const registered = wireIntoStub();
    expect(registered.size).toBe(11);
    const listStatFields = registered.get("list_stat_fields")!;
    expect(listStatFields.config.description).toContain("dimensions");
    expect(listStatFields.config.annotations["readOnlyHint"]).toBe(true);
  });

  it("returns JSON text + structuredContent on success", async () => {
    const registered = wireIntoStub();
    const result = await registered.get("list_stat_fields")!.callback({}, {});
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toBeDefined();
    expect(JSON.parse(result.content[0]!.text)).toHaveProperty("groups");
  });

  it("returns an error envelope for handler failures", async () => {
    const registered = new Map<string, RegisteredTool>();
    const serverStub = {
      registerTool(
        name: string,
        config: RegisteredTool["config"],
        cb: RegisteredTool["callback"]
      ): void {
        registered.set(name, { callback: cb, config });
      },
    } as unknown as McpServer;
    const { ctx, api } = makeToolContext();
    api.results.getStatFields = apiError("unauthorized", "Bad token.");
    wireToolsIntoMcpServer(serverStub, () => ctx);
    const result = await registered.get("list_stat_fields")!.callback({}, {});
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("Unauthorized");
  });

  it("rejects invalid arguments with field paths", async () => {
    const registered = wireIntoStub();
    const result = await registered.get("query_stats")!.callback({ groups: [] }, {});
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("Invalid input");
    expect(result.content[0]!.text).toContain("groups");
  });
});

describe("formatToolError", () => {
  it("formats every error kind", () => {
    expect(formatToolError({ kind: "unauthorized", message: "m" })).toBe("Unauthorized: m");
    expect(formatToolError({ kind: "forbidden", message: "m" })).toBe("Forbidden: m");
    expect(formatToolError({ kind: "not-found", message: "m" })).toBe("Not found: m");
    expect(formatToolError({ kind: "rate-limited", message: "m" })).toBe("Rate limited: m");
    expect(formatToolError({ kind: "rate-limited", message: "m", retryAfterMs: 100 })).toContain(
      "retry after 100 ms"
    );
    expect(formatToolError({ kind: "invalid-input", message: "m" })).toBe("Invalid input: m");
    expect(formatToolError({ kind: "upstream", message: "m" })).toBe("Upstream error: m");
    expect(formatToolError({ kind: "internal", message: "m" })).toBe("Internal error: m");
  });
});

describe("declareEmptyResourcesAndPrompts", () => {
  it("registers empty resources/prompts handlers without throwing", () => {
    const server = new McpServer({ name: "test", version: "0.0.0" });
    expect(() => {
      wireToolsIntoMcpServer(server, () => makeToolContext().ctx);
      declareEmptyResourcesAndPrompts(server);
    }).not.toThrow();
  });
});
