// Structural guard (#1588 perf review): RESOURCES_SELECT re-reads on EVERY
// resource op, including spendResource/restoreResource — the combat hot
// path. `skills`/`inventoryItems` (needed only by applyLearnExpertiseOp's
// proficient-skill validation) must stay OUT of it — they live in their own
// scoped EXPERTISE_PROFICIENCY_SELECT read inside that one applier instead.
// This test is pure/no-DB: it only inspects the exported select object's
// shape, so a future regression (re-adding either field to the shared
// select) fails here instead of only showing up as a slow combat action.
import { describe, expect, it } from "vitest";

import { RESOURCES_SELECT } from "@/lib/classes/resources.js";

describe("RESOURCES_SELECT stays lean (#1588 perf review)", () => {
  it("does not select skills or inventoryItems — those are scoped to applyLearnExpertiseOp's own read", () => {
    expect(RESOURCES_SELECT).not.toHaveProperty("skills");
    expect(RESOURCES_SELECT).not.toHaveProperty("inventoryItems");
  });
});
