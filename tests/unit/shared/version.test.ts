import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { NAME, VERSION } from "../../../src/shared/version.js";

describe("version constants", () => {
  it("match package.json", () => {
    const pkgPath = fileURLToPath(new URL("../../../package.json", import.meta.url));
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { name: string; version: string };
    expect(NAME).toBe(pkg.name);
    expect(VERSION).toBe(pkg.version);
  });
});
