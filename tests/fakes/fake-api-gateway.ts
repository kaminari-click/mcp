/**
 * Configurable in-memory {@link ApiGateway}. Every method returns the
 * pre-programmed result and records its call arguments.
 */

import type {
  ApiError,
  ApiGateway,
  DatabaseSlice,
  FilterValue,
  ReportListItem,
  ReportQuery,
  ReportSchema,
  ShareCreated,
  StatDataResult,
  StatFieldCatalog,
} from "../../src/domain/ports/api-gateway.js";
import { err, ok, type Result } from "../../src/shared/result.js";

type R<T> = Result<T, ApiError>;

export const SAMPLE_CATALOG: StatFieldCatalog = {
  groups: { time: [{ id: "time_day" }], geo: [{ id: "geo_country", filterType: "list" }] },
  metrics: { summary: [{ id: "summary_totalVisits" }], bots: [{ id: "bots_total" }] },
};

export const SAMPLE_DATA: StatDataResult = {
  rows: [{ time_day: { value: "2026-07-01" }, bots_total: { rawValue: 10, value: "10" } }],
  total: { bots_total: { rawValue: 10, value: "10" } },
  totalRows: 120,
  page: 1,
  perPage: 50,
};

export const SAMPLE_REPORT: ReportSchema = {
  id: 7,
  name: "Weekly bots",
  groups: ["time_day"],
  metrics: ["bots_total"],
  filters: { dateFrom: "2026-07-01", dateTo: "2026-07-07", timezone: 0, filters: [] },
};

export interface FakeApiGateway extends ApiGateway {
  readonly calls: { method: string; args: unknown[] }[];
  results: {
    getStatFields: R<StatFieldCatalog>;
    queryStatData: R<StatDataResult>;
    searchFilterValues: R<readonly FilterValue[]>;
    listReports: R<readonly ReportListItem[]>;
    getReport: R<ReportSchema>;
    saveReport: R<{ readonly id: number }>;
    deleteReport: R<{ readonly deleted: boolean }>;
    shareReport: R<ShareCreated>;
    getSharedReport: R<ReportSchema>;
    verifyDatabaseAccess: R<{ readonly ok: boolean }>;
    downloadDatabase: R<DatabaseSlice>;
  };
}

export function createFakeApiGateway(): FakeApiGateway {
  const calls: { method: string; args: unknown[] }[] = [];
  const gateway: FakeApiGateway = {
    calls,
    results: {
      getStatFields: ok(SAMPLE_CATALOG),
      queryStatData: ok(SAMPLE_DATA),
      searchFilterValues: ok([{ id: "US", label: "United States" }]),
      listReports: ok([{ id: 7, name: "Weekly bots", type: "user" }]),
      getReport: ok(SAMPLE_REPORT),
      saveReport: ok({ id: 42 }),
      deleteReport: ok({ deleted: true }),
      shareReport: ok({ key: "abc123", limited: false }),
      getSharedReport: ok(SAMPLE_REPORT),
      verifyDatabaseAccess: ok({ ok: true }),
      downloadDatabase: ok({ lines: ["1.2.3.4,90"], hasMore: false }),
    },
    async getStatFields() {
      calls.push({ method: "getStatFields", args: [] });
      return Promise.resolve(gateway.results.getStatFields);
    },
    async queryStatData(query: ReportQuery) {
      calls.push({ method: "queryStatData", args: [query] });
      return Promise.resolve(gateway.results.queryStatData);
    },
    async searchFilterValues(input) {
      calls.push({ method: "searchFilterValues", args: [input] });
      return Promise.resolve(gateway.results.searchFilterValues);
    },
    async listReports() {
      calls.push({ method: "listReports", args: [] });
      return Promise.resolve(gateway.results.listReports);
    },
    async getReport(id: number) {
      calls.push({ method: "getReport", args: [id] });
      return Promise.resolve(gateway.results.getReport);
    },
    async saveReport(report: ReportQuery) {
      calls.push({ method: "saveReport", args: [report] });
      return Promise.resolve(gateway.results.saveReport);
    },
    async deleteReport(id: number) {
      calls.push({ method: "deleteReport", args: [id] });
      return Promise.resolve(gateway.results.deleteReport);
    },
    async shareReport(report: ReportQuery) {
      calls.push({ method: "shareReport", args: [report] });
      return Promise.resolve(gateway.results.shareReport);
    },
    async getSharedReport(key: string) {
      calls.push({ method: "getSharedReport", args: [key] });
      return Promise.resolve(gateway.results.getSharedReport);
    },
    async verifyDatabaseAccess(kind) {
      calls.push({ method: "verifyDatabaseAccess", args: [kind] });
      return Promise.resolve(gateway.results.verifyDatabaseAccess);
    },
    async downloadDatabase(input) {
      calls.push({ method: "downloadDatabase", args: [input] });
      return Promise.resolve(gateway.results.downloadDatabase);
    },
  };
  return gateway;
}

export function apiError(kind: ApiError["kind"], message = "boom"): R<never> {
  return err({ kind, message } as ApiError);
}
