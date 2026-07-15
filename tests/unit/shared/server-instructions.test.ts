import { describe, expect, it } from "vitest";

import { SERVER_INSTRUCTIONS } from "../../../src/shared/server-instructions.js";

describe("SERVER_INSTRUCTIONS", () => {
  it("stays compact (instructions land in agent context)", () => {
    expect(SERVER_INSTRUCTIONS.length).toBeLessThan(600);
    expect(SERVER_INSTRUCTIONS).toContain("list_stat_fields");
    expect(SERVER_INSTRUCTIONS).toContain("query_stats");
  });
});
