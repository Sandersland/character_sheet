import comments from "@eslint-community/eslint-plugin-eslint-comments";
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    // Never lint generated output: dist/ (compiled) and anything under
    // src/generated/ (today the gitignored Prisma client, which ships its own
    // blanket `/* eslint-disable */` that the #1045 directive-hygiene rules
    // would otherwise flag — generated code isn't ours to annotate).
    ignores: ["dist/**", "src/generated/**"],
  },
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
    // Regression guard for the shared-DB test-isolation flake (issue #135):
    // reading the UNSCOPED character list and asserting on the whole set races
    // with parallel suites sharing one Postgres. Flag the unscoped list read so
    // a new test must consciously scope its assertion (findInList) or disable
    // this rule with a reason. See docs/testing.md.
    files: ["src/**/__tests__/**/*.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.property.name='get'][arguments.0.value='/api/characters']",
          message:
            "Don't read the unscoped character list in a test and assert on the whole set — it races with parallel suites sharing one DB. Scope to your own fixture with findInList(res.body, FIXTURE.id); see docs/testing.md. If you must list, add an eslint-disable with a reason.",
        },
      ],
    },
  }
);
