/**
 * Build a fresh, single-use MCP server + transport for ONE stateless
 * HTTP request. No `Mcp-Session-Id` is issued, so any replica can
 * serve any request; the caller MUST close both once the response is
 * written.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import type { ToolContext } from "../../application/tools/_shared/tool-context.js";
import { SERVER_INSTRUCTIONS } from "../../shared/server-instructions.js";
import { NAME, VERSION } from "../../shared/version.js";
import { declareEmptyResourcesAndPrompts } from "../shared/declare-empty-caps.js";
import { wireToolsIntoMcpServer } from "../shared/wire-tools.js";

export interface StatelessMcp {
  readonly server: McpServer;
  readonly transport: StreamableHTTPServerTransport;
}

export async function createStatelessMcp(ctx: ToolContext): Promise<StatelessMcp> {
  const server = new McpServer(
    { name: NAME, version: VERSION },
    { instructions: SERVER_INSTRUCTIONS }
  );
  wireToolsIntoMcpServer(server, () => ctx);
  declareEmptyResourcesAndPrompts(server);

  const transport = new StreamableHTTPServerTransport({
    // Stateless: leaving `sessionIdGenerator` unset issues no session id.
    enableJsonResponse: true,
  });

  try {
    // @ts-expect-error SDK's Transport.onclose optionality mismatches
    // Server.connect's expected type under exactOptionalPropertyTypes.
    await server.connect(transport);
  } catch (cause) {
    /* v8 ignore start -- defensive: `connect` on a fresh stateless
       transport cannot fail today; guarded so a future SDK change
       cannot leak a half-built pair. */
    await transport.close().catch(() => undefined);
    await server.close().catch(() => undefined);
    throw cause;
    /* v8 ignore stop */
  }
  return { server, transport };
}
