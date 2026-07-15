/**
 * Bridge from the {@link Tool} contract to the MCP SDK's
 * `server.registerTool(...)`. Keeps the ToolError -> MCP error
 * envelope conversion out of individual tools.
 *
 * The `ctxProvider` indirection lets the HTTP transport supply a
 * per-request {@link ToolContext} while the stdio transport supplies a
 * process-wide constant.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { registerAllTools } from "../../application/tool-registry.js";
import type { ToolContext } from "../../application/tools/_shared/tool-context.js";
import type { ToolError } from "../../application/tools/_shared/tool-result.js";

export type ToolContextProvider = () => ToolContext;

/** Register every tool from the registry into the given MCP server. */
export function wireToolsIntoMcpServer(server: McpServer, ctxProvider: ToolContextProvider): void {
  registerAllTools((tool) => {
    // `as never` casts work around the SDK's zod-union typing limits;
    // runtime behaviour is identical to the strictly-typed path.
    server.registerTool(
      tool.name,
      {
        title: tool.annotations.title,
        description: tool.description,
        inputSchema: tool.inputSchema as never,
        annotations: { ...tool.annotations },
      },
      (async (rawArgs: unknown): Promise<CallToolResult> => {
        const ctx = ctxProvider();
        const parsed = tool.inputSchema.safeParse(rawArgs);
        if (!parsed.success) {
          return toolErrorToMcpResult({
            kind: "invalid-input",
            message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
          });
        }
        const result = await tool.handler(parsed.data, ctx);
        if (result.isErr()) {
          return toolErrorToMcpResult(result.error);
        }
        return toolOkToMcpResult(result.value);
      }) as never
    );
  });
}

function toolOkToMcpResult(value: unknown): CallToolResult {
  const isPlainObject = value !== null && typeof value === "object" && !Array.isArray(value);
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    ...(isPlainObject ? { structuredContent: value as Record<string, unknown> } : {}),
  };
}

function toolErrorToMcpResult(error: ToolError): CallToolResult {
  return {
    isError: true,
    content: [{ type: "text", text: formatToolError(error) }],
  };
}

/** Render a {@link ToolError} as agent-actionable text. */
export function formatToolError(error: ToolError): string {
  switch (error.kind) {
    case "unauthorized":
      return `Unauthorized: ${error.message}`;
    case "forbidden":
      return `Forbidden: ${error.message}`;
    case "not-found":
      return `Not found: ${error.message}`;
    case "rate-limited":
      return `Rate limited: ${error.message}${
        error.retryAfterMs === undefined ? "" : ` (retry after ${String(error.retryAfterMs)} ms)`
      }`;
    case "invalid-input":
      return `Invalid input: ${error.message}`;
    case "upstream":
      return `Upstream error: ${error.message}`;
    case "internal":
      return `Internal error: ${error.message}`;
  }
}
