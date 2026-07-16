import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**", "dist-mcpb/**", "coverage/**", "node_modules/**", "scripts/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["eslint.config.js"],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Tools and adapters must not log via console — the Logger port
      // is the only channel (stdout is the MCP JSON-RPC channel).
      "no-console": "error",
      "@typescript-eslint/explicit-function-return-type": "error",
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      // Clean-architecture gate: application/domain code must not
      // import infrastructure adapters — dependencies flow through
      // ToolContext only.
      "no-restricted-imports": [
        "error",
        { patterns: [{ group: ["**/infrastructure/**"], message: "Use ToolContext instead." }] },
      ],
    },
  },
  {
    // Composition roots and infrastructure may import infrastructure.
    files: ["src/presentation/**", "src/infrastructure/**", "src/bin.ts", "tests/**"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
  {
    files: ["tests/**"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/explicit-function-return-type": "off",
    },
  },
  {
    files: ["*.ts", "*.js"],
    rules: {
      "@typescript-eslint/explicit-function-return-type": "off",
    },
  },
  prettier
);
