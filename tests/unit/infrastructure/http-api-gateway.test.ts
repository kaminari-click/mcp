import { describe, expect, it } from "vitest";

import { createHttpApiGateway } from "../../../src/infrastructure/api/http-api-gateway.js";
import { BearerToken } from "../../../src/domain/value-objects/bearer-token.js";
import { newRequestId } from "../../../src/domain/value-objects/request-id.js";
import { createFakeLogger } from "../../fakes/fake-logger.js";

interface Captured {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

function makeGateway(responder: (url: string, init: RequestInit) => Response | Promise<Response>): {
  gateway: ReturnType<typeof createHttpApiGateway>;
  captured: Captured[];
} {
  const captured: Captured[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    captured.push({
      url,
      method: init?.method ?? "GET",
      headers: (init?.headers ?? {}) as Record<string, string>,
      ...(typeof init?.body === "string" ? { body: init.body } : {}),
    });
    return responder(url, init ?? {});
  }) as typeof fetch;
  const gateway = createHttpApiGateway({
    baseUrl: "https://api.test/",
    bearer: BearerToken.fromString("test-token")!,
    requestId: newRequestId(),
    logger: createFakeLogger(),
    fetchImpl,
  });
  return { gateway, captured };
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

describe("createHttpApiGateway", () => {
  it("sends auth, request-id headers and strips trailing slash from base", async () => {
    const { gateway, captured } = makeGateway(() =>
      jsonResponse({ code: 200, data: { groups: {}, metrics: {} } })
    );
    const result = await gateway.getStatFields();
    expect(result.isOk()).toBe(true);
    expect(captured[0]!.url).toBe("https://api.test/api/stat/get");
    expect(captured[0]!.method).toBe("OPTIONS");
    expect(captured[0]!.headers["authorization"]).toBe("Bearer test-token");
    expect(captured[0]!.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("posts the report body for queryStatData", async () => {
    const { gateway, captured } = makeGateway(() =>
      jsonResponse({ code: 200, data: { rows: [], totalRows: 0, page: 1, perPage: 50 } })
    );
    const query = { groups: ["time_day"], metrics: ["bots_total"], filters: { timezone: 0 } };
    const result = await gateway.queryStatData(query);
    expect(result.isOk()).toBe(true);
    expect(captured[0]!.url).toBe("https://api.test/api/stat/data");
    expect(JSON.parse(captured[0]!.body!)).toEqual(query);
  });

  it("posts filter lookups to /api/stat/filter", async () => {
    const { gateway, captured } = makeGateway(() =>
      jsonResponse({ code: 200, data: { items: [{ id: "US", label: "United States" }] } })
    );
    const result = await gateway.searchFilterValues({ id: "geo_country", searchQuery: "uni" });
    expect(result._unsafeUnwrap()).toEqual([{ id: "US", label: "United States" }]);
    expect(captured[0]!.url).toBe("https://api.test/api/stat/filter");
    expect(JSON.parse(captured[0]!.body!)).toEqual({ id: "geo_country", searchQuery: "uni" });
  });

  it("surfaces the server message for sub-500 errors", async () => {
    const { gateway } = makeGateway(() => jsonResponse({ msg: "Too many" }, 429));
    const result = await gateway.listReports();
    expect(result._unsafeUnwrapErr()).toMatchObject({
      kind: "upstream",
      status: 429,
      message: "Too many",
    });
  });

  it("handles non-JSON error bodies", async () => {
    const { gateway } = makeGateway(() => new Response("Bad gateway", { status: 502 }));
    const result = await gateway.listReports();
    expect(result._unsafeUnwrapErr()).toMatchObject({ kind: "upstream", status: 502 });
  });

  it("handles empty response bodies", async () => {
    const { gateway } = makeGateway(() => new Response("", { status: 200 }));
    const result = await gateway.listReports();
    expect(result._unsafeUnwrapErr().kind).toBe("upstream");
  });

  it("maps network failures", async () => {
    const { gateway } = makeGateway(() => {
      throw new Error("ECONNREFUSED");
    });
    const result = await gateway.getStatFields();
    expect(result._unsafeUnwrapErr()).toMatchObject({ kind: "network", message: "ECONNREFUSED" });
  });

  it("maps a thrown non-Error to a generic network message", async () => {
    const { gateway } = makeGateway(() => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw "boom";
    });
    const result = await gateway.getStatFields();
    expect(result._unsafeUnwrapErr()).toMatchObject({ kind: "network", message: "fetch failed" });
  });

  it("routes report CRUD to the right endpoints", async () => {
    const { gateway, captured } = makeGateway((url, init) => {
      const method = init.method ?? "GET";
      if (method === "DELETE") return jsonResponse({ code: 200, data: { result: true } });
      if (method === "PUT") return jsonResponse({ code: 200, data: { id: 42 } });
      if (url.includes("/api/stat/get/id/")) {
        return jsonResponse({ code: 200, data: { groups: [], metrics: [], filters: {} } });
      }
      return jsonResponse({ code: 200, data: { items: [] } });
    });
    expect((await gateway.listReports()).isOk()).toBe(true);
    expect((await gateway.getReport(7)).isOk()).toBe(true);
    expect((await gateway.saveReport({ groups: [], metrics: [], filters: {} })).isOk()).toBe(true);
    expect((await gateway.deleteReport(7)).isOk()).toBe(true);
    expect(captured.map((c) => `${c.method} ${c.url}`)).toEqual([
      "POST https://api.test/api/stat/get",
      "POST https://api.test/api/stat/get/id/7",
      "PUT https://api.test/api/stat/get",
      "DELETE https://api.test/api/stat/get/id/7",
    ]);
  });

  it("routes share endpoints and url-encodes the key", async () => {
    const { gateway, captured } = makeGateway((url) =>
      url.includes("/share/id/")
        ? jsonResponse({ code: 200, data: { groups: [], metrics: [], filters: {} } })
        : jsonResponse({ code: 200, data: { id: "k1" } })
    );
    expect(
      (await gateway.shareReport({ groups: [], metrics: [], filters: {} }))._unsafeUnwrap()
    ).toEqual({ key: "k1", limited: false });
    expect((await gateway.getSharedReport("a/b")).isOk()).toBe(true);
    expect(captured[1]!.url).toBe("https://api.test/api/stat/share/id/a%2Fb");
  });

  it("verifies database access per kind", async () => {
    const { gateway, captured } = makeGateway(() => jsonResponse({ code: 200, data: [] }));
    expect((await gateway.verifyDatabaseAccess("ip_bot"))._unsafeUnwrap()).toEqual({ ok: true });
    await gateway.verifyDatabaseAccess("ip_vpn");
    await gateway.verifyDatabaseAccess("ua_bot");
    expect(captured.map((c) => c.url)).toEqual([
      "https://api.test/download/bases/verify/ip/bot",
      "https://api.test/download/bases/verify/ip/vpn",
      "https://api.test/download/bases/verify/ua/bot",
    ]);
  });

  it("propagates verify errors", async () => {
    const { gateway } = makeGateway(() => jsonResponse({ msg: "No sub" }, 403));
    const result = await gateway.verifyDatabaseAccess("ip_bot");
    expect(result._unsafeUnwrapErr()).toMatchObject({ kind: "upstream", message: "No sub" });
  });

  describe("downloadDatabase", () => {
    it("streams CSV lines up to maxLines and flags hasMore", async () => {
      const csv = ["1.1.1.1,90", "2.2.2.2,80", "3.3.3.3,70"].join("\n");
      const { gateway } = makeGateway(() => new Response(csv, { status: 200 }));
      const slice = (
        await gateway.downloadDatabase({ kind: "ip_bot", maxLines: 2 })
      )._unsafeUnwrap();
      expect(slice.lines).toEqual(["1.1.1.1,90", "2.2.2.2,80"]);
      expect(slice.hasMore).toBe(true);
    });

    it("stops reading mid-stream once the limit is hit", async () => {
      // Complete lines beyond the limit inside one chunk exercise the
      // in-loop truncation + reader.cancel path.
      const csv = "a,1\nb,2\nc,3\nd,4\n";
      const { gateway } = makeGateway(() => new Response(csv, { status: 200 }));
      const slice = (
        await gateway.downloadDatabase({ kind: "ip_bot", maxLines: 2 })
      )._unsafeUnwrap();
      expect(slice.lines).toEqual(["a,1", "b,2"]);
      expect(slice.hasMore).toBe(true);
    });

    it("returns all lines including a trailing partial line", async () => {
      const { gateway } = makeGateway(() => new Response("a,1\nb,2", { status: 200 }));
      const slice = (
        await gateway.downloadDatabase({ kind: "ua_bot", maxLines: 10 })
      )._unsafeUnwrap();
      expect(slice.lines).toEqual(["a,1", "b,2"]);
      expect(slice.hasMore).toBe(false);
    });

    it("flags hasMore when the trailing line exceeds the limit", async () => {
      const { gateway } = makeGateway(() => new Response("a,1\nb,2", { status: 200 }));
      const slice = (
        await gateway.downloadDatabase({ kind: "ua_bot", maxLines: 1 })
      )._unsafeUnwrap();
      expect(slice.lines).toEqual(["a,1"]);
      expect(slice.hasMore).toBe(true);
    });

    it("skips empty lines", async () => {
      const { gateway } = makeGateway(() => new Response("a,1\n\n\nb,2\n", { status: 200 }));
      const slice = (
        await gateway.downloadDatabase({ kind: "ip_vpn", maxLines: 10 })
      )._unsafeUnwrap();
      expect(slice.lines).toEqual(["a,1", "b,2"]);
    });

    it("builds range paths", async () => {
      const { gateway, captured } = makeGateway(() => new Response("", { status: 200 }));
      await gateway.downloadDatabase({ kind: "ip_bot", from: 80, to: 100, maxLines: 5 });
      expect(captured[0]!.url).toBe("https://api.test/api/ip/bot/from/80/to/100");
    });

    it("maps JSON error bodies", async () => {
      const { gateway } = makeGateway(() => jsonResponse({ msg: "No sub" }, 403));
      const result = await gateway.downloadDatabase({ kind: "ip_bot", maxLines: 5 });
      expect(result._unsafeUnwrapErr()).toMatchObject({
        kind: "upstream",
        status: 403,
        message: "No sub",
      });
    });

    it("maps plain-text error bodies", async () => {
      const { gateway } = makeGateway(() => new Response("Denied", { status: 403 }));
      const result = await gateway.downloadDatabase({ kind: "ip_bot", maxLines: 5 });
      expect(result._unsafeUnwrapErr()).toMatchObject({
        kind: "upstream",
        status: 403,
        message: "Denied",
      });
    });

    it("maps network failures", async () => {
      const { gateway } = makeGateway(() => {
        throw new Error("reset");
      });
      const result = await gateway.downloadDatabase({ kind: "ip_bot", maxLines: 5 });
      expect(result._unsafeUnwrapErr().kind).toBe("network");
    });

    it("maps a thrown non-Error to a generic message", async () => {
      const { gateway } = makeGateway(() => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw "boom";
      });
      const result = await gateway.downloadDatabase({ kind: "ip_bot", maxLines: 5 });
      expect(result._unsafeUnwrapErr()).toMatchObject({
        kind: "network",
        message: "fetch failed",
      });
    });

    it("handles a null body", async () => {
      const { gateway } = makeGateway(() => new Response(null, { status: 200 }));
      const slice = (
        await gateway.downloadDatabase({ kind: "ip_bot", maxLines: 5 })
      )._unsafeUnwrap();
      expect(slice).toEqual({ lines: [], hasMore: false });
    });
  });
});
