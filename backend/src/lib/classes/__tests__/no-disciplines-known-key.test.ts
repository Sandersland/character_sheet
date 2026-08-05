// #1503 AC: `disciplinesKnown` must never come back as a state key —
// resurrecting it would silently re-attach the orphaned pre-retirement
// `resources.disciplinesKnown` array a live dev-database character carries
// (a snapshot of a deleted `disciplineId`, #1247/34f5a4cf). The real key is
// choicesKnown["fourElementsDisciplines"] (#899's generic mechanism).
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

describe("no `disciplinesKnown` key anywhere under backend/src (#1503)", () => {
  it("grep -rn disciplinesKnown backend/src returns nothing (outside this test's own why-comment)", () => {
    const repoRoot = fileURLToPath(new URL("../../../../../", import.meta.url));
    let output = "";
    try {
      output = execFileSync(
        "grep",
        ["-rn", "--exclude=no-disciplines-known-key.test.ts", "disciplinesKnown", "backend/src"],
        { cwd: repoRoot, encoding: "utf-8" },
      );
    } catch (err) {
      // grep exits 1 when nothing matches — the PASSING case.
      const status = (err as { status?: number }).status;
      if (status === 1) return;
      throw err;
    }
    expect(output, `found disciplinesKnown reference(s):\n${output}`).toBe("");
  });
});
