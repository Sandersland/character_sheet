import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// Docs are pointers, not mirrors (CLAUDE.md) — and a pointer naming a file that
// no longer exists is exactly the drift the policy exists to prevent. Every
// backtick-quoted backend `lib/...ts` path in docs/architecture.md must exist
// under backend/src, so a file move that strands a doc pointer fails loudly.
// Placeholder paths (`lib/auth/oauth/providers/<name>.ts`) are skipped.
const backendSrcDir = fileURLToPath(new URL("../..", import.meta.url));
const architectureDocPath = fileURLToPath(new URL("../../../../docs/architecture.md", import.meta.url));

function libTsPaths(text: string): string[] {
  return [...text.matchAll(/`(lib\/[^`]+\.ts)`/g)].map((match) => match[1]).filter((p) => !p.includes("<"));
}

describe("docs/architecture.md lib references", () => {
  it("only references backend lib/*.ts paths that exist under backend/src", () => {
    const referenced = libTsPaths(readFileSync(architectureDocPath, "utf-8"));

    // Guards the test itself against a doc rewrite silently emptying the match set.
    expect(referenced.length).toBeGreaterThan(5);

    const missing = referenced.filter((relativePath) => !existsSync(path.join(backendSrcDir, relativePath)));
    expect(missing).toEqual([]);
  });
});
