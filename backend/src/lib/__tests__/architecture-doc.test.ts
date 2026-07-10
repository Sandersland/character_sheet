import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// docs/architecture.md's `lib/` table (`### `lib/` — domain logic`) declares
// itself sourced from `ls backend/src/lib/`, and its "Intent-bearing
// transaction pattern" section (under a separate "## Cross-cutting data
// patterns" heading) prose-references the same backend lib/ files. CLAUDE.md's
// doc-mapping table requires both to stay in sync with backend/src/lib/* moves
// — a stale entry is a documentation bug, not polish (#652 review). This test
// reads every backtick-quoted `lib/...ts` path in those two sections (table
// rows AND prose, e.g. "owned by `makeTransactionsEndpoint` in `lib/foo.ts`")
// and asserts the file still exists under backend/src, so a future move that
// forgets a doc update fails loudly instead of rotting silently.
//
// Scoped to just these two sections (not the whole doc) because the "###
// Router map" and frontend `### `lib/`` sections legitimately reference
// frontend-only modules with the same bare `lib/x.ts` shorthand (e.g. `the
// frontend session turn-hook (`lib/turnHooks.ts`...)`) — those aren't backend
// paths and would be false positives for this check. One such frontend mirror
// ("the frontend `lib/mentions.ts`") sits inside the domain-logic table's own
// prose, so it's excluded by a negative lookbehind rather than section scope.
const backendSrcDir = fileURLToPath(new URL("../..", import.meta.url));
const architectureDocPath = fileURLToPath(new URL("../../../../docs/architecture.md", import.meta.url));

function section(doc: string, headingText: string): string {
  const lines = doc.split("\n");
  const start = lines.findIndex((line) => /^#+\s/.test(line) && line.includes(headingText));
  if (start === -1) throw new Error(`heading not found: ${headingText}`);
  const end = lines.slice(start + 1).findIndex((line) => /^#+\s/.test(line));
  return lines.slice(start + 1, end === -1 ? undefined : start + 1 + end).join("\n");
}

function libTsPaths(text: string): string[] {
  return [...text.matchAll(/(?<!the frontend )`(lib\/[^`]+\.ts)`/g)].map((match) => match[1]);
}

describe("docs/architecture.md lib references", () => {
  it("only references backend lib/*.ts paths that exist under backend/src", () => {
    const doc = readFileSync(architectureDocPath, "utf-8");
    const referenced = [
      ...libTsPaths(section(doc, "`lib/` — domain logic")),
      ...libTsPaths(section(doc, "Intent-bearing transaction pattern")),
    ];

    // Guards the test itself against a heading rename silently emptying the match set.
    expect(referenced.length).toBeGreaterThan(30);

    const missing = referenced.filter((relativePath) => !existsSync(path.join(backendSrcDir, relativePath)));
    expect(missing).toEqual([]);
  });
});
