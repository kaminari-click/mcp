/**
 * The only channel a tool handler has to the outside world. Built by
 * the transport (per request in HTTP mode, per process in stdio mode).
 * Tools MUST NOT read globals — all dependencies flow through here.
 */

import type { ApiGateway } from "../../../domain/ports/api-gateway.js";
import type { Logger } from "../../../domain/ports/logger.js";
import type { RequestId } from "../../../domain/value-objects/request-id.js";

export interface ToolContext {
  /** Bound to the caller's Bearer; fresh per request in HTTP mode. */
  readonly api: ApiGateway;
  /** Pre-scoped with `request_id` (+ `bearer_hash` in HTTP mode). */
  readonly logger: Logger;
  /** Forwarded to the API as `X-Request-Id`. */
  readonly requestId: RequestId;
}
