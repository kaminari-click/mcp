import { builtinModules } from "node:module";

import { defineConfig } from "tsup";

/**
 * MCPB bundle build for Claude Desktop.
 *
 * A `.mcpb` ships as a self-contained ZIP that installs without
 * `npm install`, so ALL dependencies are inlined into a single
 * `dist-mcpb/index.js`. Only Node built-ins stay external.
 *
 * The `createRequire` banner keeps inlined CommonJS dependencies
 * (pino-pretty, parts of the MCP SDK) working inside the ESM bundle.
 */
export default defineConfig({
  entry: { index: "src/bin.ts" },
  outDir: "dist-mcpb",
  format: ["esm"],
  target: "node20",
  platform: "node",
  bundle: true,
  noExternal: [/.*/],
  external: [...builtinModules, ...builtinModules.map((m) => `node:${m}`)],
  dts: false,
  sourcemap: false,
  minify: false,
  splitting: false,
  treeshake: true,
  clean: true,
  banner: {
    js: [
      "#!/usr/bin/env node",
      'import { createRequire as __mcpbCreateRequire } from "node:module";',
      "const require = __mcpbCreateRequire(import.meta.url);",
    ].join("\n"),
  },
  tsconfig: "./tsconfig.build.json",
});
