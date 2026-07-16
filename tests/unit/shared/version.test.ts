import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { NAME, VERSION } from "../../../src/shared/version.js";

function readJson(relativeFromTest: string): Record<string, unknown> {
  const path = fileURLToPath(new URL(relativeFromTest, import.meta.url));
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

describe("version constants", () => {
  it("match package.json and synced packaging manifests", () => {
    const pkg = readJson("../../../package.json") as { name: string; version: string };
    const manifest = readJson("../../../manifest.json") as { version: string };
    const server = readJson("../../../server.json") as {
      version: string;
      packages: Array<{ version: string }>;
    };

    expect(NAME).toBe(pkg.name);
    expect(VERSION).toBe(pkg.version);
    expect(manifest.version).toBe(pkg.version);
    expect(server.version).toBe(pkg.version);
    expect(server.packages[0]?.version).toBe(pkg.version);
  });
});
