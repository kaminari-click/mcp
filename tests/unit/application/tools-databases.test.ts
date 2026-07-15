import { describe, expect, it } from "vitest";

import { checkDatabaseAccessTool } from "../../../src/application/tools/databases/check-database-access.tool.js";
import { downloadDatabaseTool } from "../../../src/application/tools/databases/download-database.tool.js";
import { ok } from "../../../src/shared/result.js";
import { apiError } from "../../fakes/fake-api-gateway.js";
import { makeToolContext } from "../../fakes/make-tool-context.js";

describe("check_database_access", () => {
  it("returns accessible=true when the subscription covers the base", async () => {
    const { ctx, api } = makeToolContext();
    const input = checkDatabaseAccessTool.inputSchema.parse({ kind: "ip_bot" });
    const result = await checkDatabaseAccessTool.handler(input, ctx);
    expect(result._unsafeUnwrap()).toEqual({ accessible: true });
    expect(api.calls[0]).toEqual({ method: "verifyDatabaseAccess", args: ["ip_bot"] });
  });

  it("maps forbidden for a missing subscription", async () => {
    const { ctx, api } = makeToolContext();
    api.results.verifyDatabaseAccess = apiError("forbidden");
    const input = checkDatabaseAccessTool.inputSchema.parse({ kind: "ua_bot" });
    expect((await checkDatabaseAccessTool.handler(input, ctx))._unsafeUnwrapErr().kind).toBe(
      "forbidden"
    );
  });
});

describe("download_database", () => {
  it("returns lines with has_more and a full-export curl", async () => {
    const { ctx, api } = makeToolContext();
    api.results.downloadDatabase = ok({ lines: ["1.2.3.4,90", "5.6.7.8,85"], hasMore: true });
    const input = downloadDatabaseTool.inputSchema.parse({ kind: "ip_bot", max_lines: 2 });
    const output = (await downloadDatabaseTool.handler(input, ctx))._unsafeUnwrap();
    expect(output.lines).toHaveLength(2);
    expect(output.returned_lines).toBe(2);
    expect(output.has_more).toBe(true);
    expect(output.full_export_curl).toContain("https://kaminari.click/api/ip/bot");
    expect(output.full_export_curl).not.toContain("/from/");
    const sent = api.calls[0]!.args[0] as { maxLines: number };
    expect(sent.maxLines).toBe(2);
  });

  it("includes the range in the gateway call and curl", async () => {
    const { ctx, api } = makeToolContext();
    const input = downloadDatabaseTool.inputSchema.parse({ kind: "ip_bot", from: 80, to: 100 });
    const output = (await downloadDatabaseTool.handler(input, ctx))._unsafeUnwrap();
    expect(output.full_export_curl).toContain("/api/ip/bot/from/80/to/100");
    expect(api.calls[0]!.args[0]).toMatchObject({ from: 80, to: 100, maxLines: 1000 });
  });

  it("uses the right path per database kind", async () => {
    const { ctx } = makeToolContext();
    const inputVpn = downloadDatabaseTool.inputSchema.parse({ kind: "ip_vpn" });
    const outVpn = (await downloadDatabaseTool.handler(inputVpn, ctx))._unsafeUnwrap();
    expect(outVpn.full_export_curl).toContain("/api/ip/vpn");
    const inputUa = downloadDatabaseTool.inputSchema.parse({ kind: "ua_bot" });
    const outUa = (await downloadDatabaseTool.handler(inputUa, ctx))._unsafeUnwrap();
    expect(outUa.full_export_curl).toContain("/api/ua/bot");
  });

  it("maps gateway errors", async () => {
    const { ctx, api } = makeToolContext();
    api.results.downloadDatabase = apiError("forbidden");
    const input = downloadDatabaseTool.inputSchema.parse({ kind: "ip_vpn" });
    expect((await downloadDatabaseTool.handler(input, ctx))._unsafeUnwrapErr().kind).toBe(
      "forbidden"
    );
  });
});
