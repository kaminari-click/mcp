/**
 * Composition root for the stdio transport. One process = one tenant;
 * the Bearer comes from `KAMINARI_CLICK_API_KEY` and all adapters are
 * constructed once.
 */

import process from "node:process";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { BearerToken } from "../../domain/value-objects/bearer-token.js";
import { newRequestId } from "../../domain/value-objects/request-id.js";
import { createHttpApiGateway } from "../../infrastructure/api/http-api-gateway.js";
import { createPinoLogger } from "../../infrastructure/logging/pino-logger.js";
import type { Config } from "../../shared/config.js";
import { SERVER_INSTRUCTIONS } from "../../shared/server-instructions.js";
import { NAME, VERSION } from "../../shared/version.js";
import { declareEmptyResourcesAndPrompts } from "../shared/declare-empty-caps.js";
import { wireToolsIntoMcpServer } from "../shared/wire-tools.js";

/** Build the stdio MCP server; resolves with an exit code on close. */
export async function bootstrapStdio(config: Config): Promise<number> {
  const logger = createPinoLogger(config.logLevel, config.logFormat);

  if (config.stdioApiKey === undefined) {
    logger.fatal({}, "stdio.missing_api_key");
    process.stderr.write(
      "KAMINARI_CLICK_API_KEY is required in stdio mode. Generate a token in the Kaminari Click account settings (API section).\n"
    );
    return 2;
  }
  const bearer = BearerToken.fromString(config.stdioApiKey);
  if (bearer === undefined) {
    logger.fatal({}, "stdio.invalid_api_key");
    return 2;
  }

  const requestId = newRequestId();
  const scopedLogger = logger.child({ request_id: requestId, bearer_hash: bearer.hash() });
  const api = createHttpApiGateway({
    baseUrl: config.apiBaseUrl,
    bearer,
    requestId,
    logger: scopedLogger,
  });

  const ctx = { api, logger: scopedLogger, requestId };
  const server = new McpServer(
    { name: NAME, version: VERSION },
    { instructions: SERVER_INSTRUCTIONS }
  );
  wireToolsIntoMcpServer(server, () => ctx);
  declareEmptyResourcesAndPrompts(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  scopedLogger.info({}, "stdio.ready");

  await new Promise<void>((resolve) => {
    transport.onclose = (): void => {
      resolve();
    };
  });
  scopedLogger.info({}, "stdio.shutdown");
  return 0;
}
