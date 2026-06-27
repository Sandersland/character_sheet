import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ["dist/**"],
  },
  {
    // Regression guard for the shared-DB test-isolation flake (issue #135):
    // reading the UNSCOPED character list and asserting on the whole set races
    // with parallel suites sharing one Postgres. Flag the unscoped list read so
    // a new test must consciously scope its assertion (findInList) or disable
    // this rule with a reason. See .claude/docs/testing.md.
    files: ["src/**/__tests__/**/*.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.property.name='get'][arguments.0.value='/api/characters']",
          message:
            "Don't read the unscoped character list in a test and assert on the whole set — it races with parallel suites sharing one DB. Scope to your own fixture with findInList(res.body, FIXTURE.id); see .claude/docs/testing.md. If you must list, add an eslint-disable with a reason.",
        },
      ],
    },
  }
);
