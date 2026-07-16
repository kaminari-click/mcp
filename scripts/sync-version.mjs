#!/usr/bin/env node
/**
 * Single source of truth: package.json `name` / `version`.
 * Syncs into src/shared/version.ts, manifest.json, and server.json.
 *
 * Run via `npm run sync-version`, or automatically on `npm version`
 * / prebuild / pretest.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const { name, version } = pkg;

if (typeof name !== "string" || typeof version !== "string") {
  throw new Error("package.json must define string name and version");
}

writeFileSync(
  join(root, "src/shared/version.ts"),
  `/**
 * Package name and version — generated from package.json by
 * \`scripts/sync-version.mjs\`. Do not edit by hand; run
 * \`npm run sync-version\` (or \`npm version …\`).
 */

export const NAME = ${JSON.stringify(name)};
export const VERSION = ${JSON.stringify(version)};
`
);

function patchJson(relativePath, mutate) {
  const path = join(root, relativePath);
  const data = JSON.parse(readFileSync(path, "utf8"));
  mutate(data);
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}

patchJson("manifest.json", (manifest) => {
  manifest.version = version;
});

patchJson("server.json", (server) => {
  server.version = version;
  if (Array.isArray(server.packages) && server.packages[0]) {
    server.packages[0].version = version;
  }
});

// Keep JSON/TS layout aligned with `prettier --check` in CI.
execFileSync(
  "npx",
  ["prettier", "--write", "manifest.json", "server.json", "src/shared/version.ts"],
  { cwd: root, stdio: "inherit" }
);

process.stdout.write(`Synced ${name}@${version} → version.ts, manifest.json, server.json\n`);
