/**
 * Port to the Kaminari Click public API (`/api/stat/*`, `/api/ip/*`,
 * `/api/ua/*`). Implemented by `infrastructure/api/http-api-gateway.ts`
 * in production and by `FakeApiGateway` in tests.
 *
 * All methods return `Result<T, ApiError>` — no throwing across the
 * port boundary.
 */

import type { Result } from "../../shared/result.js";

/** Expected API failure modes, mapped from HTTP status + body. */
export type ApiError =
  | { readonly kind: "unauthorized"; readonly message: string }
  | { readonly kind: "forbidden"; readonly message: string }
  | { readonly kind: "not-found"; readonly message: string }
  | { readonly kind: "rate-limited"; readonly message: string; readonly retryAfterMs?: number }
  | { readonly kind: "invalid-input"; readonly message: string }
  | { readonly kind: "upstream"; readonly message: string; readonly status?: number }
  | { readonly kind: "network"; readonly message: string };

/** One grouping dimension or metric from the account's catalog. */
export interface StatField {
  readonly id: string;
  /** `list` or `range` — how the dimension can be filtered (dimensions only). */
  readonly filterType?: string;
}

/** Catalog of dimensions and metrics available to this account. */
export interface StatFieldCatalog {
  /** Dimension IDs grouped by category (time, sub, geo, device, screen, ...). */
  readonly groups: Readonly<Record<string, readonly StatField[]>>;
  /** Metric IDs grouped by category (summary, bots, lowQuality, ...). */
  readonly metrics: Readonly<Record<string, readonly StatField[]>>;
}

/** Per-dimension filter of a statistics query. */
export interface StatFilter {
  readonly id: string;
  readonly type: "list" | "range";
  readonly include?: readonly string[];
  readonly exclude?: readonly string[];
  readonly range?: { readonly from?: number | string; readonly to?: number | string };
}

/** Date scope of a statistics query. */
export interface StatDateScope {
  readonly dateFrom?: string;
  readonly dateTo?: string;
  readonly period?: string;
  readonly timezone?: number;
  readonly filters?: readonly StatFilter[];
}

/** Previous-period comparison settings. */
export interface StatCompare {
  readonly dateFrom?: string;
  readonly dateTo?: string;
  readonly period?: string;
  readonly mode?: string;
  readonly sort?: boolean;
}

/**
 * Full report definition — the request body of `/api/stat/data`,
 * `/api/stat/share` and `PUT /api/stat/get`.
 */
export interface ReportQuery {
  readonly groups: readonly string[];
  readonly metrics: readonly string[];
  readonly filters: StatDateScope;
  readonly compare?: StatCompare | null;
  readonly sort?: Readonly<Record<string, "ASC" | "DESC">>;
  readonly page?: number;
  readonly perPage?: number;
  /** Saved-report id or shared reportKey to query by reference. */
  readonly id?: number | string;
  readonly name?: string;
}

/** One table cell: raw + formatted value, plus compare deltas if requested. */
export interface StatCell {
  readonly rawValue?: unknown;
  readonly value?: unknown;
  readonly diff?: unknown;
  readonly percent?: unknown;
  readonly compare_value?: unknown;
}

/**
 * A row/total field value. Metric and group cells are `StatCell` objects;
 * the API also emits primitives (`id` as number, group markers like
 * `"fullResult"` in the totals row).
 */
export type StatRowValue = StatCell | string | number | boolean | null;

/** Result of a statistics data query. */
export interface StatDataResult {
  readonly rows: readonly Readonly<Record<string, StatRowValue>>[];
  readonly total?: Readonly<Record<string, StatRowValue>>;
  readonly totalRows: number;
  readonly page: number;
  readonly perPage: number;
}

/** Saved-report list entry. */
export interface ReportListItem {
  readonly id: number;
  readonly name: string;
  readonly type: string;
}

/** Full saved/shared report schema as stored by the API. */
export interface ReportSchema {
  readonly id?: number | string;
  readonly name?: string;
  readonly groups: readonly string[];
  readonly metrics: readonly string[];
  readonly filters: StatDateScope;
  readonly compare?: StatCompare | null;
  readonly sort?: Readonly<Record<string, "ASC" | "DESC">>;
}

/** Result of creating a share link. */
export interface ShareCreated {
  /** Short reportKey — append to `https://kaminari.click/stat?reportKey=`. */
  readonly key: string;
  /** True when the shared snapshot was truncated (>2500 rows). */
  readonly limited: boolean;
}

/** Autocomplete item for a filter value. */
export interface FilterValue {
  readonly id: string;
  readonly label: string;
  readonly children?: readonly FilterValue[];
}

/** Reference database identifier. */
export type DatabaseKind = "ip_bot" | "ip_vpn" | "ua_bot";

/** Truncated slice of a reference database CSV export. */
export interface DatabaseSlice {
  readonly lines: readonly string[];
  readonly hasMore: boolean;
}

export interface ApiGateway {
  getStatFields(): Promise<Result<StatFieldCatalog, ApiError>>;
  queryStatData(query: ReportQuery): Promise<Result<StatDataResult, ApiError>>;
  searchFilterValues(input: {
    readonly id: string;
    readonly searchQuery?: string;
    readonly dateFrom?: string;
    readonly dateTo?: string;
  }): Promise<Result<readonly FilterValue[], ApiError>>;

  listReports(): Promise<Result<readonly ReportListItem[], ApiError>>;
  getReport(id: number): Promise<Result<ReportSchema, ApiError>>;
  saveReport(report: ReportQuery): Promise<Result<{ readonly id: number }, ApiError>>;
  deleteReport(id: number): Promise<Result<{ readonly deleted: boolean }, ApiError>>;

  shareReport(report: ReportQuery): Promise<Result<ShareCreated, ApiError>>;
  getSharedReport(key: string): Promise<Result<ReportSchema, ApiError>>;

  verifyDatabaseAccess(kind: DatabaseKind): Promise<Result<{ readonly ok: boolean }, ApiError>>;
  downloadDatabase(input: {
    readonly kind: DatabaseKind;
    readonly from?: number;
    readonly to?: number;
    readonly maxLines: number;
  }): Promise<Result<DatabaseSlice, ApiError>>;
}
