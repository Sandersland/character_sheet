import comments from "@eslint-community/eslint-plugin-eslint-comments";
import js from "@eslint/js";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

// Domain modules (@/api/characters etc.) bypass vi.mock("@/api/client")'s
// full-factory replacement (#1297) — the mock silently stops applying and
// the test hits real fetch. client.ts is the mockable barrel; queryKeys/
// queryClient are key builders and a QueryClient instance, not fetch
// wrappers, so hooks legitimately import them directly.
const API_BARREL_PATTERN = {
  group: ["@/api/*", "!@/api/client", "!@/api/queryKeys", "!@/api/queryClient"],
  message:
    "Import from '@/api/client', not a domain module directly — a direct import bypasses vi.mock(\"@/api/client\")'s full-factory replacement, so the mock silently stops applying and the test exercises the real module and hits fetch (#1297).",
};

// CLAUDE.md: "@/ for all cross-file imports — never ../". Same-directory ./x
// siblings are unaffected (the pattern only matches a leading "../").
const PARENT_RELATIVE_PATTERN = {
  group: ["../*"],
  message: "Use the '@/' alias instead of '../' — CLAUDE.md bans parent-relative imports in frontend/src.",
};

// "Never call fetch from a component" (CLAUDE.md) — fetch is called from
// http.ts alone, underneath the per-domain api/ modules.
const FETCH_MESSAGE =
  "Don't call global fetch directly — use apiFetch/rawFetch from '@/api/http', or a domain module via the '@/api/client' barrel.";

export default tseslint.config(
  // e2e/** already falls outside every files glob; listed so the carve-out is by name.
  { ignores: ["dist/**", "playwright-report/**", "test-results/**", "e2e/**"] },
  // Stale eslint-disable directives fail lint the moment they stop being needed (#1045).
  { linterOptions: { reportUnusedDisableDirectives: "error" } },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // `null: "ignore"` permits the codebase's pervasive `== null`/`!= null` idiom
  // (catches null and undefined together); every other loose comparison is
  // banned — closes check-edition-branching.sh's `==`/`!=` escape hatch (#1978).
  { rules: { eqeqeq: ["error", "always", { null: "ignore" }] } },
  {
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
      // interactive elements, etc. at dev time. Runtime a11y is checked separately
      // via jest-axe in component tests.
      ...jsxA11y.flatConfigs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
    },
  },
  {
    // Applied repo-wide under src/ (failure-closed: a new directory is
    // covered by default). Flat config's no-restricted-imports is last-
    // match-wins for the WHOLE rule value per matching file, not merged
    // per pattern — so any later block that also sets this rule for an
    // overlapping files glob must re-declare every pattern that should
    // still apply there, not just the one it's adding or removing. src/api/**
    // below re-declares PARENT_RELATIVE_PATTERN only (the barrel fence is off
    // there by design: domain modules legitimately import @/api/http, and
    // client.ts's barrel imports every domain module).
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [API_BARREL_PATTERN, PARENT_RELATIVE_PATTERN] }],
    },
  },
  {
    // The api layer itself. See the re-declare why-comment on the block above.
    files: ["src/api/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [PARENT_RELATIVE_PATTERN] }],
    },
  },
  {
    // Applied repo-wide under src/ (failure-closed) — http.ts is exempted
    // below, by name, not by omission. barrel.test.ts's "only api/http.ts
    // calls fetch(...)" check scans src/api/ non-recursively for the literal
    // fetch( call, so it doesn't see window.fetch/globalThis.fetch/self.fetch
    // or a bare-fetch call outside src/api/ — the no-restricted-syntax rule
    // below is what actually covers those, this rule only covers the bare
    // `fetch` identifier. vi.stubGlobal("fetch", ...) in api/*.test.ts passes
    // a string argument, not a reference to the global, so it's unaffected.
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-globals": ["error", { name: "fetch", message: FETCH_MESSAGE }],
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[object.name=/^(window|globalThis|self)$/][property.name=\"fetch\"]",
          message: FETCH_MESSAGE,
        },
      ],
    },
  },
  {
    // The one file allowed to call global fetch (enforced by barrel.test.ts).
    files: ["src/api/http.ts"],
    rules: { "no-restricted-globals": "off", "no-restricted-syntax": "off" },
  }
);
