/**
 * Declare empty `resources` / `prompts` capabilities so client
 * startup probes (`resources/list`, `prompts/list`) succeed silently
 * instead of producing `-32601 Method not found` noise.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

export function declareEmptyResourcesAndPrompts(server: McpServer): void {
  server.server.registerCapabilities({ resources: {}, prompts: {} });
  server.server.setRequestHandler(ListResourcesRequestSchema, async () => {
    await Promise.resolve();
    return { resources: [] };
  });
  server.server.setRequestHandler(ListPromptsRequestSchema, async () => {
    await Promise.resolve();
    return { prompts: [] };
  });
}
