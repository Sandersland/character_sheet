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
    // The blob-store port (#1614) exists so nothing above createBlobStore
    // knows the storage vendor: an @aws-sdk import outside the storage domain
    // is exactly the SDK-type leak the port prevents. Applied repo-wide under
    // src/ (failure-closed: a new directory is covered by default) —
    // src/lib/storage/** is exempted below, by name, not by omission.
    files: ["src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@aws-sdk/*"],
              message:
                "Import the BlobStore port (createBlobStore) instead of @aws-sdk — provider SDKs are fenced inside the storage domain so call sites stay vendor-agnostic (#1614).",
            },
          ],
        },
      ],
    },
  },
  {
    // The storage domain itself: the s3 driver and its tests legitimately use
    // the SDK. Flat config is last-match-wins per rule, so this later "off"
    // overrides the block above.
    files: ["src/lib/storage/**/*.ts"],
    rules: { "no-restricted-imports": "off" },
  }
);
