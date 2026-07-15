import { describe, expect, it } from "vitest";

import { deleteReportTool } from "../../../src/application/tools/reports/delete-report.tool.js";
import { getReportTool } from "../../../src/application/tools/reports/get-report.tool.js";
import { getSharedReportTool } from "../../../src/application/tools/reports/get-shared-report.tool.js";
import { listReportsTool } from "../../../src/application/tools/reports/list-reports.tool.js";
import { saveReportTool } from "../../../src/application/tools/reports/save-report.tool.js";
import { shareReportTool } from "../../../src/application/tools/reports/share-report.tool.js";
import { ok } from "../../../src/shared/result.js";
import { apiError, SAMPLE_REPORT } from "../../fakes/fake-api-gateway.js";
import { makeToolContext } from "../../fakes/make-tool-context.js";

const baseReport = {
  groups: ["time_day"],
  metrics: ["bots_total"],
  date_from: "2026-07-01",
  date_to: "2026-07-07",
};

describe("list_reports", () => {
  it("returns report list items", async () => {
    const { ctx } = makeToolContext();
    const result = await listReportsTool.handler({}, ctx);
    expect(result._unsafeUnwrap().items).toEqual([{ id: 7, name: "Weekly bots", type: "user" }]);
  });

  it("maps gateway errors", async () => {
    const { ctx, api } = makeToolContext();
    api.results.listReports = apiError("unauthorized");
    expect((await listReportsTool.handler({}, ctx))._unsafeUnwrapErr().kind).toBe("unauthorized");
  });
});

describe("get_report", () => {
  it("returns the full schema", async () => {
    const { ctx, api } = makeToolContext();
    const input = getReportTool.inputSchema.parse({ id: 7 });
    const result = await getReportTool.handler(input, ctx);
    expect(result._unsafeUnwrap()).toEqual(SAMPLE_REPORT);
    expect(api.calls[0]).toEqual({ method: "getReport", args: [7] });
  });

  it("maps not-found", async () => {
    const { ctx, api } = makeToolContext();
    api.results.getReport = apiError("not-found");
    const input = getReportTool.inputSchema.parse({ id: 999 });
    expect((await getReportTool.handler(input, ctx))._unsafeUnwrapErr().kind).toBe("not-found");
  });
});

describe("save_report", () => {
  it("saves and returns the new id", async () => {
    const { ctx, api } = makeToolContext();
    const input = saveReportTool.inputSchema.parse({ ...baseReport, name: "My report" });
    const result = await saveReportTool.handler(input, ctx);
    expect(result._unsafeUnwrap()).toEqual({ id: 42 });
    const sent = api.calls[0]!.args[0] as { name: string };
    expect(sent.name).toBe("My report");
  });

  it("requires dates or a period", async () => {
    const { ctx } = makeToolContext();
    const input = saveReportTool.inputSchema.parse({
      groups: ["a"],
      metrics: ["b"],
      name: "No dates",
    });
    expect((await saveReportTool.handler(input, ctx))._unsafeUnwrapErr().kind).toBe(
      "invalid-input"
    );
  });

  it("maps gateway errors", async () => {
    const { ctx, api } = makeToolContext();
    api.results.saveReport = apiError("invalid-input");
    const input = saveReportTool.inputSchema.parse({ ...baseReport, name: "Bad" });
    expect((await saveReportTool.handler(input, ctx))._unsafeUnwrapErr().kind).toBe(
      "invalid-input"
    );
  });
});

describe("delete_report", () => {
  it("deletes by id", async () => {
    const { ctx, api } = makeToolContext();
    const input = deleteReportTool.inputSchema.parse({ id: 7 });
    const result = await deleteReportTool.handler(input, ctx);
    expect(result._unsafeUnwrap()).toEqual({ deleted: true });
    expect(api.calls[0]).toEqual({ method: "deleteReport", args: [7] });
  });

  it("maps forbidden (standard reports are not deletable)", async () => {
    const { ctx, api } = makeToolContext();
    api.results.deleteReport = apiError("forbidden");
    const input = deleteReportTool.inputSchema.parse({ id: 1 });
    expect((await deleteReportTool.handler(input, ctx))._unsafeUnwrapErr().kind).toBe("forbidden");
  });
});

describe("share_report", () => {
  it("returns key, ready URL and limited flag", async () => {
    const { ctx } = makeToolContext();
    const input = shareReportTool.inputSchema.parse(baseReport);
    const output = (await shareReportTool.handler(input, ctx))._unsafeUnwrap();
    expect(output).toEqual({
      report_key: "abc123",
      url: "https://kaminari.click/stat?reportKey=abc123",
      limited: false,
    });
  });

  it("propagates limited=true for truncated snapshots", async () => {
    const { ctx, api } = makeToolContext();
    api.results.shareReport = ok({ key: "big1", limited: true });
    const input = shareReportTool.inputSchema.parse(baseReport);
    expect((await shareReportTool.handler(input, ctx))._unsafeUnwrap().limited).toBe(true);
  });

  it("requires dates or a period", async () => {
    const { ctx } = makeToolContext();
    const input = shareReportTool.inputSchema.parse({ groups: ["a"], metrics: ["b"] });
    expect((await shareReportTool.handler(input, ctx))._unsafeUnwrapErr().kind).toBe(
      "invalid-input"
    );
  });

  it("maps gateway errors", async () => {
    const { ctx, api } = makeToolContext();
    api.results.shareReport = apiError("upstream");
    const input = shareReportTool.inputSchema.parse(baseReport);
    expect((await shareReportTool.handler(input, ctx))._unsafeUnwrapErr().kind).toBe("upstream");
  });
});

describe("get_shared_report", () => {
  it("fetches by report key", async () => {
    const { ctx, api } = makeToolContext();
    const input = getSharedReportTool.inputSchema.parse({ report_key: "abc123" });
    const result = await getSharedReportTool.handler(input, ctx);
    expect(result._unsafeUnwrap()).toEqual(SAMPLE_REPORT);
    expect(api.calls[0]).toEqual({ method: "getSharedReport", args: ["abc123"] });
  });

  it("maps not-found for expired keys", async () => {
    const { ctx, api } = makeToolContext();
    api.results.getSharedReport = apiError("not-found");
    const input = getSharedReportTool.inputSchema.parse({ report_key: "expired" });
    expect((await getSharedReportTool.handler(input, ctx))._unsafeUnwrapErr().kind).toBe(
      "not-found"
    );
  });
});
