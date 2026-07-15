/**
 * Builds a {@link ToolContext} wired to fakes for unit tests.
 */

import type { ToolContext } from "../../src/application/tools/_shared/tool-context.js";
import { newRequestId } from "../../src/domain/value-objects/request-id.js";
import { createFakeApiGateway, type FakeApiGateway } from "./fake-api-gateway.js";
import { createFakeLogger, type FakeLogger } from "./fake-logger.js";

export interface TestToolContext {
  readonly ctx: ToolContext;
  readonly api: FakeApiGateway;
  readonly logger: FakeLogger;
}

export function makeToolContext(): TestToolContext {
  const api = createFakeApiGateway();
  const logger = createFakeLogger();
  return { ctx: { api, logger, requestId: newRequestId() }, api, logger };
}
