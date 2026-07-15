import { defineConfig } from "vitest/config";

/**
 * Coverage thresholds are the project's coverage gate. CI fails on
 * regression. Never lower them.
 *
 * Excluded from coverage:
 *   - type-only files (compile to empty JS, v8 reports 0%)
 *   - `bin.ts` and the transport composition roots — exercised
 *     end-to-end by the integration/isolation suites, not unit-testable
 *     without a real process/socket.
 */
export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["node_modules/**", "dist/**", "dist-mcpb/**", "coverage/**"],
    pool: "forks",
    isolate: true,
    sequence: { concurrent: false },
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "json", "html", "lcov"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.d.ts",
        // Pure re-export barrel / type-only files: no runtime code.
        "src/shared/result.ts",
        "src/domain/ports/**",
        "src/application/tools/_shared/tool.ts",
        "src/application/tools/_shared/tool-context.ts",
        "src/application/tools/_shared/tool-result.ts",
        // CLI entry — covered by the integration smoke test on dist/.
        "src/bin.ts",
        // Composition roots: construct process-wide adapters and bind
        // sockets/stdio. Exercised end-to-end via the integration
        // suite and MCP Inspector; their parts (request handler,
        // gateway, limiter, logger) are all unit-tested.
        "src/presentation/stdio/stdio-bootstrap.ts",
        "src/presentation/http/http-bootstrap.ts",
      ],
      thresholds: {
        lines: 100,
        functions: 100,
        statements: 100,
        branches: 95,
        autoUpdate: false,
      },
    },
  },
});
