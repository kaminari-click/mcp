import { describe, expect, it } from "vitest";

import { listStatFieldsTool } from "../../../src/application/tools/stats/list-stat-fields.tool.js";
import { queryStatsTool } from "../../../src/application/tools/stats/query-stats.tool.js";
import { searchFilterValuesTool } from "../../../src/application/tools/stats/search-filter-values.tool.js";
import { apiError, SAMPLE_CATALOG } from "../../fakes/fake-api-gateway.js";
import { makeToolContext } from "../../fakes/make-tool-context.js";
import { ok } from "../../../src/shared/result.js";

describe("list_stat_fields", () => {
  it("returns the catalog", async () => {
    const { ctx } = makeToolContext();
    const result = await listStatFieldsTool.handler({}, ctx);
    expect(result._unsafeUnwrap()).toEqual(SAMPLE_CATALOG);
  });

  it("maps gateway errors", async () => {
    const { ctx, api } = makeToolContext();
    api.results.getStatFields = apiError("unauthorized");
    const result = await listStatFieldsTool.handler({}, ctx);
    expect(result._unsafeUnwrapErr().kind).toBe("unauthorized");
  });
});

describe("query_stats", () => {
  const input = queryStatsTool.inputSchema.parse({
    groups: ["time_day"],
    metrics: ["bots_total"],
    date_from: "2026-07-01",
    date_to: "2026-07-07",
  });

  it("returns rows with pagination info and has_more", async () => {
    const { ctx, api } = makeToolContext();
    const result = await queryStatsTool.handler(input, ctx);
    const output = result._unsafeUnwrap();
    expect(output.total_rows).toBe(120);
    expect(output.has_more).toBe(true);
    expect(output.rows).toHaveLength(1);
    expect(api.calls[0]).toMatchObject({ method: "queryStatData" });
    const sent = api.calls[0]!.args[0] as { page: number; perPage: number };
    expect(sent.page).toBe(1);
    expect(sent.perPage).toBe(50);
  });

  it("reports has_more=false on the last page", async () => {
    const { ctx, api } = makeToolContext();
    api.results.queryStatData = ok({ rows: [], totalRows: 10, page: 1, perPage: 50 });
    const output = (await queryStatsTool.handler(input, ctx))._unsafeUnwrap();
    expect(output.has_more).toBe(false);
  });

  it("rejects a query without dates or period", async () => {
    const { ctx } = makeToolContext();
    const bad = queryStatsTool.inputSchema.parse({ groups: ["a"], metrics: ["b"] });
    const result = await queryStatsTool.handler(bad, ctx);
    expect(result._unsafeUnwrapErr().kind).toBe("invalid-input");
  });

  it("accepts a period preset without dates", async () => {
    const { ctx } = makeToolContext();
    const withPeriod = queryStatsTool.inputSchema.parse({
      groups: ["a"],
      metrics: ["b"],
      period: "today",
    });
    expect((await queryStatsTool.handler(withPeriod, ctx)).isOk()).toBe(true);
  });

  it("maps gateway errors", async () => {
    const { ctx, api } = makeToolContext();
    api.results.queryStatData = apiError("upstream");
    const result = await queryStatsTool.handler(input, ctx);
    expect(result._unsafeUnwrapErr().kind).toBe("upstream");
  });
});

describe("search_filter_values", () => {
  it("passes all arguments to the gateway", async () => {
    const { ctx, api } = makeToolContext();
    const input = searchFilterValuesTool.inputSchema.parse({
      id: "geo_country",
      search_query: "uni",
      date_from: "2026-07-01",
      date_to: "2026-07-07",
    });
    const result = await searchFilterValuesTool.handler(input, ctx);
    expect(result._unsafeUnwrap().items).toEqual([{ id: "US", label: "United States" }]);
    expect(api.calls[0]!.args[0]).toEqual({
      id: "geo_country",
      searchQuery: "uni",
      dateFrom: "2026-07-01",
      dateTo: "2026-07-07",
    });
  });

  it("omits optional arguments when absent", async () => {
    const { ctx, api } = makeToolContext();
    const input = searchFilterValuesTool.inputSchema.parse({ id: "sub_botType" });
    await searchFilterValuesTool.handler(input, ctx);
    expect(api.calls[0]!.args[0]).toEqual({ id: "sub_botType" });
  });

  it("maps gateway errors", async () => {
    const { ctx, api } = makeToolContext();
    api.results.searchFilterValues = apiError("forbidden");
    const input = searchFilterValuesTool.inputSchema.parse({ id: "geo_country" });
    const result = await searchFilterValuesTool.handler(input, ctx);
    expect(result._unsafeUnwrapErr().kind).toBe("forbidden");
  });
});
