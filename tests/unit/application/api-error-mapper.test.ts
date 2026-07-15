import { describe, expect, it } from "vitest";

import type { ApiError } from "../../../src/domain/ports/api-gateway.js";
import { mapApiError } from "../../../src/application/services/api-error-mapper.js";

describe("mapApiError", () => {
  it("maps unauthorized with a token hint", () => {
    const mapped = mapApiError({ kind: "unauthorized", message: "Bad token." });
    expect(mapped.kind).toBe("unauthorized");
    expect(mapped.message).toContain("API token");
  });

  it("maps forbidden with a subscription hint", () => {
    const mapped = mapApiError({ kind: "forbidden", message: "No access." });
    expect(mapped.kind).toBe("forbidden");
    expect(mapped.message).toContain("subscription");
  });

  it("passes not-found and invalid-input through", () => {
    expect(mapApiError({ kind: "not-found", message: "Missing." })).toEqual({
      kind: "not-found",
      message: "Missing.",
    });
    expect(mapApiError({ kind: "invalid-input", message: "Bad." })).toEqual({
      kind: "invalid-input",
      message: "Bad.",
    });
  });

  it("keeps retryAfterMs on rate-limited errors", () => {
    const mapped = mapApiError({ kind: "rate-limited", message: "Slow down.", retryAfterMs: 500 });
    expect(mapped).toMatchObject({ kind: "rate-limited", retryAfterMs: 500 });
  });

  it("omits retryAfterMs when absent", () => {
    const mapped = mapApiError({ kind: "rate-limited", message: "Slow down." });
    expect("retryAfterMs" in mapped).toBe(false);
  });

  it("maps upstream with status and a retry hint", () => {
    const mapped = mapApiError({ kind: "upstream", message: "Boom.", status: 502 });
    expect(mapped).toMatchObject({ kind: "upstream", status: 502 });
    expect(mapped.message).toContain("smaller date range");
  });

  it("maps upstream without status", () => {
    const mapped = mapApiError({ kind: "upstream", message: "Boom." });
    expect("status" in mapped).toBe(false);
  });

  it("maps network to internal", () => {
    const mapped = mapApiError({ kind: "network", message: "ECONNREFUSED" } as ApiError);
    expect(mapped.kind).toBe("internal");
    expect(mapped.message).toContain("ECONNREFUSED");
  });
});
