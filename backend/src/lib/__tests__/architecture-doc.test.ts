import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// docs/architecture.md's `lib/` table (`### `lib/` — domain logic`) declares
// itself sourced from `ls backend/src/lib/` and CLAUDE.md's doc-mapping table
// requires it to be updated whenever backend/src/lib/* moves or changes — a
// stale entry here is a documentation bug, not polish (#652 review). This
// test reads every table row's first-column `lib/...ts` path and asserts the
// file still exists at that path under backend/src, so a future move that
// forgets the doc update fails loudly instead of rotting silently.
const backendSrcDir = fileURLToPath(new URL("../..", import.meta.url));
const architectureDocPath = fileURLToPath(new URL("../../../../docs/architecture.md", import.meta.url));

function tableRowLibPaths(doc: string): string[] {
  return doc
    .split("\n")
    .map((line) => /^\|\s*`(lib\/[^`]+\.ts)`\s*\|/.exec(line))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => match[1]);
}

describe("docs/architecture.md lib table", () => {
  it("only lists lib/*.ts paths that exist under backend/src", () => {
    const doc = readFileSync(architectureDocPath, "utf-8");
    const referenced = tableRowLibPaths(doc);

    // Guards the test itself against a header rename silently emptying the match set.
    expect(referenced.length).toBeGreaterThan(30);

    const missing = referenced.filter((relativePath) => !existsSync(path.join(backendSrcDir, relativePath)));
    expect(missing).toEqual([]);
  });
});
