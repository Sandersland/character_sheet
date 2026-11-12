import comments from "@eslint-community/eslint-plugin-eslint-comments";
import js from "@eslint/js";
import tseslint from "typescript-eslint";

// The blob-store port (#1614) exists so nothing above createBlobStore knows
// the storage vendor: an @aws-sdk import outside the storage domain is
// exactly the SDK-type leak the port prevents.
const AWS_SDK_PATTERN = {
  group: ["@aws-sdk/*"],
  message:
    "Import the BlobStore port (createBlobStore) instead of @aws-sdk — provider SDKs are fenced inside the storage domain so call sites stay vendor-agnostic (#1614).",
};

// CLAUDE.md: "@/* for cross-directory imports; same-directory siblings stay
// relative ./x.js" — ../ is neither, so it's banned too. Same-directory
// ./x.js is unaffected (the pattern only matches a leading "../").
const PARENT_RELATIVE_PATTERN = {
  group: ["../*"],
  message: "Use the '@/' alias instead of '../' for a cross-directory import — CLAUDE.md reserves relative imports for same-directory siblings (./x.js).",
};

// lib/ is the HTTP-free domain layer: Express and its middleware live in
// src/http (#2006, #2007). fallow zones only see file imports, so package
// imports are fenced here instead.
const EXPRESS_PATTERN = {
  group: ["express", "express-*", "helmet", "cookie-parser", "multer", "pino-http"],
  message: "lib/ must not import Express or its middleware — HTTP-aware code belongs in src/http (#2007).",
};

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
  // `null: "ignore"` permits the codebase's pervasive `== null`/`!= null` idiom
  // (catches null and undefined together); every other loose comparison is
  // banned — closes check-edition-branching.sh's `==`/`!=` escape hatch (#1978).
  { rules: { eqeqeq: ["error", "always", { null: "ignore" }] } },
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
    // Applied repo-wide under src/ (failure-closed: a new directory is
    // covered by default). Flat config's no-restricted-imports is last-
    // match-wins for the WHOLE rule value per matching file, not merged per
    // pattern — so any later block that also sets this rule for an
    // overlapping files glob must re-declare every pattern that should still
    // apply there, not just the one it's adding or removing.
    files: ["src/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [AWS_SDK_PATTERN, PARENT_RELATIVE_PATTERN] }],
    },
  },
  {
    // lib/ adds the Express ban. See the re-declare why-comment on the block above.
    files: ["src/lib/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [AWS_SDK_PATTERN, PARENT_RELATIVE_PATTERN, EXPRESS_PATTERN] }],
    },
  },
  {
    // The storage domain itself. See the re-declare why-comment on the block above.
    files: ["src/lib/storage/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [PARENT_RELATIVE_PATTERN, EXPRESS_PATTERN] }],
    },
  },
  {
    // __tests__ directories outside the storage domain. See the re-declare
    // why-comment on the main ban above.
    files: ["src/**/__tests__/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [AWS_SDK_PATTERN] }],
    },
  },
  {
    // lib/ tests keep the Express ban the __tests__ block above would otherwise drop.
    files: ["src/lib/**/__tests__/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [AWS_SDK_PATTERN, EXPRESS_PATTERN] }],
    },
  },
  {
    // The genuine double exemption: storage-domain test files are both
    // legitimate aws-sdk callers AND the __tests__ "../foo.js" convention.
    // Ordered after every block above so it wins outright for this narrower
    // glob; only the Express ban still applies.
    files: ["src/lib/storage/**/__tests__/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [EXPRESS_PATTERN] }],
    },
  },
  {
    // process.env is read in exactly one place (#2008). Declared as its own block
    // for a rule no-restricted-imports blocks don't touch, so the last-match-wins
    // clobbering described above doesn't apply; the exemptions below are explicit.
    files: ["src/**/*.ts"],
    ignores: ["src/lib/core/config.ts", "src/**/__tests__/**", "src/**/*.test.ts"],
    rules: {
      "no-restricted-properties": [
        "error",
        {
          object: "process",
          property: "env",
          message: "Read configuration from `config` (@/lib/core/config.js); process.env is parsed once there (#2008).",
        },
      ],
    },
  }
);
