// ABOUTME: ESLint flat config for the Duvo project.
// ABOUTME: Combines @eslint/js, typescript-eslint, eslint-plugin-n, and disables style rules via eslint-config-prettier.

import js from "@eslint/js";
import tseslint from "typescript-eslint";
import nodePlugin from "eslint-plugin-n";
import prettierConfig from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      "bun.lock",
      "docs/**",
      "coverage/**",
      "dist/**",
      "build/**",
      ".eslintcache",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  nodePlugin.configs["flat/recommended"],
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.es2024,
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Bun / TS path resolution doesn't play nicely with eslint-plugin-n's
      // import resolver; rely on TypeScript for this check instead.
      "n/no-missing-import": "off",
      // Bun is not a known Node module; silence this for the server files.
      "n/no-unsupported-features/node-builtins": "off",
      // This is an application, not a published package; devDependencies are fine.
      "n/no-unpublished-import": "off",
    },
  },
  {
    files: ["src/**/*.test.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-expressions": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
    },
  },
  prettierConfig,
);
