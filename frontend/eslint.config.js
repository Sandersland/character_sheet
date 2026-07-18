import comments from "@eslint-community/eslint-plugin-eslint-comments";
import js from "@eslint/js";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "playwright-report/**", "test-results/**"] },
  // Stale eslint-disable directives fail lint the moment they stop being needed (#1045).
  { linterOptions: { reportUnusedDisableDirectives: "error" } },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Comment hygiene, machine-enforcing the CLAUDE.md comment policy.
    // Suppression directives (#1045): every disable must name its rule
    // (no-unlimited-disable) and carry a `-- reason` (require-description).
    // Warning markers (#1057): the no-warning-comments terms below are banned
    // anywhere in a comment — track the work in an issue, not a marker that rots.
    plugins: { "@eslint-community/eslint-comments": comments },
    rules: {
      "@eslint-community/eslint-comments/no-unlimited-disable": "error",
      "@eslint-community/eslint-comments/require-description": "error",
      "no-warning-comments": [
        "error",
        { terms: ["todo", "fixme", "xxx"], location: "anywhere" },
      ],
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      "jsx-a11y": jsxA11y,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Static accessibility lint: catches missing labels, bad ARIA, non-semantic
      // interactive elements, etc. at dev time. Runtime a11y is checked via jest-axe
      // in component tests (see src/test/axe.ts).
      ...jsxA11y.flatConfigs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
    },
  }
);
