import { defineConfig } from "tsup";

/**
 * npm-package build: `dist/bin.js` ESM entry with a shebang.
 * Dependencies stay external — npm installs them next to the package.
 */
export default defineConfig({
  entry: { bin: "src/bin.ts" },
  outDir: "dist",
  format: ["esm"],
  target: "node20",
  platform: "node",
  dts: false,
  sourcemap: false,
  minify: false,
  splitting: false,
  treeshake: true,
  clean: true,
  banner: { js: "#!/usr/bin/env node" },
  tsconfig: "./tsconfig.build.json",
});
