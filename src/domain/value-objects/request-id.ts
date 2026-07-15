/**
 * Per-request correlation ID (UUID v4). Logged as `request_id` and
 * forwarded to the API as `X-Request-Id`. Branded so it cannot be
 * confused with other string identifiers.
 */

import { randomUUID } from "node:crypto";

declare const requestIdBrand: unique symbol;

export type RequestId = string & { readonly [requestIdBrand]: never };

export function newRequestId(): RequestId {
  return randomUUID() as RequestId;
}
