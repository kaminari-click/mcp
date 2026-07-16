import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  buildReportQuery,
  reportInputShape,
} from "../../../src/application/tools/_shared/report-input.js";

const Schema = z.object(reportInputShape);

describe("buildReportQuery", () => {
  it("builds a minimal query with defaults", () => {
    const input = Schema.parse({
      groups: ["time_day"],
      metrics: ["bots_total"],
      date_from: "2026-07-01",
      date_to: "2026-07-07",
    });
    const query = buildReportQuery(input);
    expect(query).toEqual({
      groups: ["time_day"],
      metrics: ["bots_total"],
      filters: { dateFrom: "2026-07-01", dateTo: "2026-07-07", timezone: 0, filters: [] },
    });
  });

  it("uses a period preset and timezone", () => {
    const input = Schema.parse({
      groups: ["time_day"],
      metrics: ["bots_total"],
      period: "7days",
      timezone: 3,
    });
    const query = buildReportQuery(input);
    expect(query.filters).toEqual({ period: "7days", timezone: 3, filters: [] });
  });

  it("converts include/exclude filters to list type", () => {
    const input = Schema.parse({
      groups: ["geo_country"],
      metrics: ["summary_totalVisits"],
      period: "today",
      filters: [{ id: "geo_country", include: ["US"], exclude: ["RU"] }],
    });
    const query = buildReportQuery(input);
    expect(query.filters.filters).toEqual([
      { id: "geo_country", type: "list", include: ["US"], exclude: ["RU"] },
    ]);
  });

  it("converts from/to filters to range type", () => {
    const input = Schema.parse({
      groups: ["time_hour"],
      metrics: ["summary_totalVisits"],
      period: "today",
      filters: [{ id: "time_hour", from: 9, to: 18 }],
    });
    const query = buildReportQuery(input);
    expect(query.filters.filters).toEqual([
      { id: "time_hour", type: "range", range: { from: 9, to: 18 } },
    ]);
  });

  it("supports open-ended ranges", () => {
    const input = Schema.parse({
      groups: ["time_hour"],
      metrics: ["summary_totalVisits"],
      period: "today",
      filters: [{ id: "time_hour", from: 9 }],
    });
    expect(buildReportQuery(input).filters.filters?.[0]).toEqual({
      id: "time_hour",
      type: "range",
      range: { from: 9 },
    });
  });

  it("builds compare with explicit dates and default mode", () => {
    const input = Schema.parse({
      groups: ["time_day"],
      metrics: ["bots_total"],
      date_from: "2026-07-01",
      date_to: "2026-07-07",
      compare_date_from: "2026-06-24",
      compare_date_to: "2026-06-30",
    });
    expect(buildReportQuery(input).compare).toEqual({
      dateFrom: "2026-06-24",
      dateTo: "2026-06-30",
      mode: "diff",
      sort: false,
    });
  });

  it("builds compare from a preset with explicit mode", () => {
    const input = Schema.parse({
      groups: ["time_day"],
      metrics: ["bots_total"],
      period: "today",
      compare_period: "yesterday",
      compare_mode: "percent",
    });
    expect(buildReportQuery(input).compare).toEqual({
      period: "yesterday",
      mode: "percent",
      sort: false,
    });
  });

  it("passes compare_sort through as compare.sort", () => {
    const input = Schema.parse({
      groups: ["time_day"],
      metrics: ["bots_total"],
      period: "today",
      compare_period: "yesterday",
      compare_sort: true,
    });
    expect(buildReportQuery(input).compare).toMatchObject({ sort: true });
  });

  it("omits compare when no compare fields are set", () => {
    const input = Schema.parse({
      groups: ["time_day"],
      metrics: ["bots_total"],
      period: "today",
    });
    expect(buildReportQuery(input).compare).toBeUndefined();
  });

  it("builds sort with explicit and default direction", () => {
    const base = { groups: ["time_day"], metrics: ["bots_total"], period: "today" };
    expect(
      buildReportQuery(Schema.parse({ ...base, sort_field: "bots_total", sort_dir: "ASC" })).sort
    ).toEqual({ bots_total: "ASC" });
    expect(buildReportQuery(Schema.parse({ ...base, sort_field: "bots_total" })).sort).toEqual({
      bots_total: "DESC",
    });
  });

  it("rejects malformed dates at the schema level", () => {
    expect(
      Schema.safeParse({ groups: ["a"], metrics: ["b"], date_from: "01.07.2026" }).success
    ).toBe(false);
  });
});
