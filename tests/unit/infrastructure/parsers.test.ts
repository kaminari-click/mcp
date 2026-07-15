import { describe, expect, it } from "vitest";

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
} from "../../../src/infrastructure/api/parsers.js";

describe("unwrapEnvelope", () => {
  it("returns the inner data", () => {
    expect(unwrapEnvelope({ code: 200, data: { x: 1 } })._unsafeUnwrap()).toEqual({ x: 1 });
  });

  it("rejects a non-object body", () => {
    expect(unwrapEnvelope("nope").isErr()).toBe(true);
  });
});

describe("parseStatFieldCatalog", () => {
  it("parses groups and metrics with optional filterType", () => {
    const catalog = parseStatFieldCatalog({
      groups: { geo: [{ id: "geo_country", filterType: "list" }, { id: "geo_ip" }] },
      metrics: { bots: [{ id: "bots_total" }] },
    })._unsafeUnwrap();
    expect(catalog.groups["geo"]).toEqual([
      { id: "geo_country", filterType: "list" },
      { id: "geo_ip" },
    ]);
    expect(catalog.metrics["bots"]).toEqual([{ id: "bots_total" }]);
  });

  it("rejects a wrong shape", () => {
    expect(parseStatFieldCatalog({ groups: "x" }).isErr()).toBe(true);
  });
});

describe("parseStatData", () => {
  it("parses rows, total and coerces numbers", () => {
    const data = parseStatData({
      rows: [{ bots_total: { rawValue: 5, value: "5" } }],
      total: { bots_total: { rawValue: 5, value: "5" } },
      totalRows: "120",
      page: "2",
      perPage: "50",
    })._unsafeUnwrap();
    expect(data.totalRows).toBe(120);
    expect(data.page).toBe(2);
    expect(data.rows[0]!["bots_total"]).toMatchObject({ rawValue: 5 });
  });

  it("accepts a payload without total", () => {
    expect(parseStatData({ rows: [], totalRows: 0, page: 1, perPage: 50 }).isOk()).toBe(true);
  });

  it("rejects a wrong shape", () => {
    expect(parseStatData({ rows: "x" }).isErr()).toBe(true);
  });
});

describe("parseFilterValues", () => {
  it("parses flat and nested items, coercing ids", () => {
    const values = parseFilterValues({
      items: [{ id: 1, label: "One", children: [{ id: "1a", label: "Sub" }] }],
    })._unsafeUnwrap();
    expect(values).toEqual([{ id: "1", label: "One", children: [{ id: "1a", label: "Sub" }] }]);
  });

  it("rejects a wrong shape", () => {
    expect(parseFilterValues({ items: [{ nope: true }] }).isErr()).toBe(true);
  });
});

describe("parseReportList", () => {
  it("parses items dropping extra fields", () => {
    const items = parseReportList({
      items: [{ id: "7", name: "R", type: "user", extra: "x" }],
    })._unsafeUnwrap();
    expect(items).toEqual([{ id: 7, name: "R", type: "user" }]);
  });

  it("rejects a wrong shape", () => {
    expect(parseReportList({}).isErr()).toBe(true);
  });
});

describe("parseReportSchema", () => {
  it("parses a full report", () => {
    const report = parseReportSchema({
      id: 7,
      name: "R",
      groups: ["time_day"],
      metrics: ["bots_total"],
      filters: {
        dateFrom: "2026-07-01",
        dateTo: "2026-07-07",
        period: "7days",
        timezone: "3",
        filters: [{ id: "geo_country", type: "list", include: ["US"] }],
      },
      compare: { mode: "percent" },
      sort: { bots_total: "DESC" },
    })._unsafeUnwrap();
    expect(report).toMatchObject({
      id: 7,
      name: "R",
      groups: ["time_day"],
      filters: { dateFrom: "2026-07-01", timezone: 3 },
      sort: { bots_total: "DESC" },
    });
    expect(report.filters.filters).toHaveLength(1);
  });

  it("applies defaults for a sparse report", () => {
    const report = parseReportSchema({ name: null, sort: null })._unsafeUnwrap();
    expect(report).toEqual({ groups: [], metrics: [], filters: {} });
  });

  it("rejects a non-object", () => {
    expect(parseReportSchema("x").isErr()).toBe(true);
  });
});

describe("parseSavedReport", () => {
  it("coerces the id", () => {
    expect(parseSavedReport({ id: "42" })._unsafeUnwrap()).toEqual({ id: 42 });
  });

  it("rejects a missing id", () => {
    expect(parseSavedReport({}).isErr()).toBe(true);
  });
});

describe("parseDeleteResult", () => {
  it("parses the result flag", () => {
    expect(parseDeleteResult({ result: true })._unsafeUnwrap()).toEqual({ deleted: true });
  });

  it("rejects a missing flag", () => {
    expect(parseDeleteResult({}).isErr()).toBe(true);
  });
});

describe("parseShareCreated", () => {
  it("parses the key with default limited=false", () => {
    expect(parseShareCreated({ id: "abc" })._unsafeUnwrap()).toEqual({
      key: "abc",
      limited: false,
    });
  });

  it("keeps limited=true", () => {
    expect(parseShareCreated({ id: "abc", limited: true })._unsafeUnwrap().limited).toBe(true);
  });

  it("rejects a missing id", () => {
    expect(parseShareCreated({}).isErr()).toBe(true);
  });
});
