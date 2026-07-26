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
  },
  {
    // Domain modules (@/api/characters etc.) bypass vi.mock("@/api/client")'s
    // full-factory replacement (#1297) — the mock silently stops applying and
    // the test hits real fetch. client.ts is the mockable barrel; queryKeys/
    // queryClient are key builders and a QueryClient instance, not fetch
    // wrappers, so hooks legitimately import them directly. Applied repo-wide
    // under src/ (failure-closed: a new directory is covered by default) —
    // src/api/** is exempted below, by name, not by omission.
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/api/*", "!@/api/client", "!@/api/queryKeys", "!@/api/queryClient"],
              message:
                "Import from '@/api/client', not a domain module directly — a direct import bypasses vi.mock(\"@/api/client\")'s full-factory replacement, so the mock silently stops applying and the test exercises the real module and hits fetch (#1297).",
            },
          ],
        },
      ],
    },
  },
  {
    // The api layer itself: domain modules legitimately import @/api/http,
    // and client.ts's barrel imports every domain module. Flat config is
    // last-match-wins per rule, so this later "off" overrides the block above.
    files: ["src/api/**/*.{ts,tsx}"],
    rules: { "no-restricted-imports": "off" },
  }
);
