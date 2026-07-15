/**
 * Production {@link ApiGateway} adapter over global `fetch`.
 *
 * Tenant isolation: built per-request in HTTP mode, holding exactly
 * ONE caller's Bearer in a private closure. Never a singleton.
 *
 * Tests inject a `fetch` stub via the optional `fetchImpl` dependency.
 */

import type {
  ApiError,
  ApiGateway,
  DatabaseKind,
  DatabaseSlice,
  ReportQuery,
} from "../../domain/ports/api-gateway.js";
import type { Logger } from "../../domain/ports/logger.js";
import type { BearerToken } from "../../domain/value-objects/bearer-token.js";
import type { RequestId } from "../../domain/value-objects/request-id.js";
import { err, ok, type Result } from "../../shared/result.js";
import { toApiError } from "./error-mapping.js";
import {
  parseDeleteResult,
  parseFilterValues,
  parseReportList,
  parseReportSchema,
  parseSavedReport,
  parseShareCreated,
  parseStatData,
  parseStatFieldCatalog,
  unwrapEnvelope,
} from "./parsers.js";

export interface HttpApiGatewayDeps {
  readonly baseUrl: string;
  readonly bearer: BearerToken;
  readonly requestId: RequestId;
  readonly logger: Logger;
  /** Injectable for tests; defaults to global fetch. */
  readonly fetchImpl?: typeof fetch;
}

const DB_PATHS: Readonly<Record<DatabaseKind, string>> = {
  ip_bot: "/api/ip/bot",
  ip_vpn: "/api/ip/vpn",
  ua_bot: "/api/ua/bot",
};

const VERIFY_PATHS: Readonly<Record<DatabaseKind, string>> = {
  ip_bot: "/download/bases/verify/ip/bot",
  ip_vpn: "/download/bases/verify/ip/vpn",
  ua_bot: "/download/bases/verify/ua/bot",
};

export function createHttpApiGateway(deps: HttpApiGatewayDeps): ApiGateway {
  const { baseUrl, bearer, requestId, logger } = deps;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const base = baseUrl.replace(/\/+$/, "");

  async function call(
    method: "GET" | "POST" | "PUT" | "DELETE" | "OPTIONS",
    path: string,
    body?: unknown
  ): Promise<Result<unknown, ApiError>> {
    const startedAt = Date.now();
    let response: Response;
    try {
      response = await fetchImpl(`${base}${path}`, {
        method,
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          authorization: bearer.toAuthorizationHeader(),
          "x-request-id": requestId,
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "fetch failed";
      logger.error({ api_path: path, error_message: message }, "api.network_error");
      return err({ kind: "network", message });
    }

    const elapsed = Date.now() - startedAt;
    logger.info(
      { api_path: path, api_status: response.status, elapsed_ms: elapsed },
      "api.request_done"
    );

    let responseBody: unknown;
    const text = await response.text();
    try {
      responseBody = text.length > 0 ? JSON.parse(text) : undefined;
    } catch {
      responseBody = text;
    }

    if (!response.ok) {
      const retryAfterRaw = response.headers.get("retry-after");
      const retryAfterMs =
        retryAfterRaw !== null && !Number.isNaN(Number(retryAfterRaw))
          ? Number(retryAfterRaw) * 1000
          : undefined;
      return err(toApiError(response.status, responseBody, retryAfterMs));
    }
    return ok(responseBody);
  }

  function unwrapAnd<T>(
    result: Result<unknown, ApiError>,
    parse: (data: unknown) => Result<T, ApiError>
  ): Result<T, ApiError> {
    if (result.isErr()) return err(result.error);
    const data = unwrapEnvelope(result.value);
    if (data.isErr()) return err(data.error);
    return parse(data.value);
  }

  const gateway: ApiGateway = {
    async getStatFields() {
      return unwrapAnd(await call("OPTIONS", "/api/stat/get"), parseStatFieldCatalog);
    },

    async queryStatData(query: ReportQuery) {
      return unwrapAnd(await call("POST", "/api/stat/data", query), parseStatData);
    },

    async searchFilterValues(input) {
      return unwrapAnd(await call("POST", "/api/stat/filter", input), parseFilterValues);
    },

    async listReports() {
      return unwrapAnd(await call("POST", "/api/stat/get"), parseReportList);
    },

    async getReport(id: number) {
      return unwrapAnd(await call("POST", `/api/stat/get/id/${String(id)}`), parseReportSchema);
    },

    async saveReport(report: ReportQuery) {
      return unwrapAnd(await call("PUT", "/api/stat/get", report), parseSavedReport);
    },

    async deleteReport(id: number) {
      return unwrapAnd(await call("DELETE", `/api/stat/get/id/${String(id)}`), parseDeleteResult);
    },

    async shareReport(report: ReportQuery) {
      return unwrapAnd(await call("POST", "/api/stat/share", report), parseShareCreated);
    },

    async getSharedReport(key: string) {
      return unwrapAnd(
        await call("GET", `/api/stat/share/id/${encodeURIComponent(key)}`),
        parseReportSchema
      );
    },

    async verifyDatabaseAccess(kind: DatabaseKind) {
      const result = await call("GET", VERIFY_PATHS[kind]);
      if (result.isErr()) return err(result.error);
      return ok({ ok: true });
    },

    async downloadDatabase(input): Promise<Result<DatabaseSlice, ApiError>> {
      const rangeSuffix =
        input.from !== undefined && input.to !== undefined
          ? `/from/${String(input.from)}/to/${String(input.to)}`
          : "";
      const path = `${DB_PATHS[input.kind]}${rangeSuffix}`;

      const startedAt = Date.now();
      let response: Response;
      try {
        response = await fetchImpl(`${base}${path}`, {
          method: "GET",
          headers: {
            authorization: bearer.toAuthorizationHeader(),
            "x-request-id": requestId,
          },
        });
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "fetch failed";
        logger.error({ api_path: path, error_message: message }, "api.network_error");
        return err({ kind: "network", message });
      }
      logger.info(
        { api_path: path, api_status: response.status, elapsed_ms: Date.now() - startedAt },
        "api.request_done"
      );

      if (!response.ok) {
        const text = await response.text();
        let body: unknown = text;
        try {
          body = JSON.parse(text);
        } catch {
          // keep raw text
        }
        return err(toApiError(response.status, body));
      }

      // Stream and truncate: never buffer a multi-million-row CSV.
      const lines: string[] = [];
      let hasMore = false;
      let carry = "";
      const reader = response.body?.getReader() as
        | ReadableStreamDefaultReader<Uint8Array>
        | undefined;
      if (reader === undefined) {
        return ok({ lines: [], hasMore: false });
      }
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        carry += decoder.decode(value, { stream: true });
        const parts = carry.split("\n");
        // `split` always yields at least one element.
        carry = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.trimEnd();
          if (line.length === 0) continue;
          if (lines.length >= input.maxLines) {
            hasMore = true;
            break;
          }
          lines.push(line);
        }
        if (hasMore) {
          try {
            await reader.cancel();
          } catch {
            // A rejecting cancel() is harmless — the stream is abandoned.
          }
          break;
        }
      }
      if (!hasMore && carry.trim().length > 0) {
        if (lines.length >= input.maxLines) {
          hasMore = true;
        } else {
          lines.push(carry.trim());
        }
      }
      return ok({ lines, hasMore });
    },
  };
  return gateway;
}
