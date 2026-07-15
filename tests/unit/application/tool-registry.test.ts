import { describe, expect, it } from "vitest";
import type { z } from "zod";

import { registerAllTools } from "../../../src/application/tool-registry.js";
import type { ToolAnnotations } from "../../../src/application/tools/_shared/tool.js";

/** Metadata view of a tool — the test never invokes handlers. */
interface ToolMeta {
  readonly name: string;
  readonly description: string;
  readonly annotations: ToolAnnotations;
  readonly inputSchema: z.ZodObject<z.ZodRawShape>;
}

function collectTools(): ToolMeta[] {
  const tools: ToolMeta[] = [];
  registerAllTools((tool) => {
    tools.push(tool);
  });
  return tools;
}

describe("tool registry", () => {
  const tools = collectTools();

  it("registers all 11 PRD tools with unique snake_case names", () => {
    const names = tools.map((t) => t.name);
    expect(names).toEqual([
      "list_stat_fields",
      "query_stats",
      "search_filter_values",
      "list_reports",
      "get_report",
      "save_report",
      "delete_report",
      "share_report",
      "get_shared_report",
      "check_database_access",
      "download_database",
    ]);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name).toMatch(/^[a-z][a-z0-9_]*$/);
  });

  it("keeps descriptions compact (context budget)", () => {
    for (const tool of tools) {
      expect(tool.description.length, tool.name).toBeGreaterThan(30);
      expect(tool.description.length, tool.name).toBeLessThan(260);
    }
  });

  it("describes every input field", () => {
    for (const tool of tools) {
      for (const [field, schema] of Object.entries(tool.inputSchema.shape)) {
        expect(schema.description, `${tool.name}.${field} missing .describe()`).toBeTruthy();
      }
    }
  });

  it("annotates read-only vs destructive coherently", () => {
    for (const tool of tools) {
      if (tool.annotations.readOnlyHint) {
        expect(tool.annotations.destructiveHint, tool.name).toBe(false);
      }
      expect(tool.annotations.openWorldHint, tool.name).toBe(false);
      expect(tool.annotations.title.length, tool.name).toBeGreaterThan(3);
    }
    const destructive = tools.filter((t) => t.annotations.destructiveHint).map((t) => t.name);
    expect(destructive).toEqual(["delete_report"]);
  });
});
