import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const backendSrcDir = fileURLToPath(new URL("../..", import.meta.url));
const architectureDocPath = fileURLToPath(new URL("../../../../docs/architecture.md", import.meta.url));

function libTsPaths(text: string): string[] {
  return [...text.matchAll(/`(lib\/[^`]+\.ts)`/g)].map((match) => match[1]).filter((p) => !p.includes("<"));
}

describe("docs/architecture.md lib references", () => {
  it("only references backend lib/*.ts paths that exist under backend/src", () => {
    const referenced = libTsPaths(readFileSync(architectureDocPath, "utf-8"));

    // Not vacuously true: the doc must reference more than 5 lib paths.
    expect(referenced.length).toBeGreaterThan(5);

    const missing = referenced.filter((relativePath) => !existsSync(path.join(backendSrcDir, relativePath)));
    expect(missing).toEqual([]);
  });
});
