// Pure unit tests for resolveEditionRow (#1306) — the single place the
// exact-edition-then-NULL-fallback ordering is expressed for the five
// edition-tagged catalogs (Feat, Subclass, GrantedAbility, Action, Background).
import { describe, expect, it } from "vitest";

import { editionOrShared, resolveEditionRow } from "@/lib/rules/catalog-edition.js";

interface Row {
  id: string;
  edition: "EDITION_2014" | "EDITION_2024" | null;
}

describe("resolveEditionRow", () => {
  it("resolves an exact-edition hit when only that edition's row is present", () => {
    const rows: Row[] = [{ id: "a-2014", edition: "EDITION_2014" }];
    expect(resolveEditionRow(rows, "EDITION_2014")?.id).toBe("a-2014");
  });

  it("falls back to the NULL row when no exact-edition row exists", () => {
    const rows: Row[] = [{ id: "shared", edition: null }];
    expect(resolveEditionRow(rows, "EDITION_2014")?.id).toBe("shared");
    expect(resolveEditionRow(rows, "EDITION_2024")?.id).toBe("shared");
  });

  it("returns undefined when neither an exact nor a NULL row is present", () => {
    const rows: Row[] = [{ id: "b-2024", edition: "EDITION_2024" }];
    expect(resolveEditionRow(rows, "EDITION_2014")).toBeUndefined();
  });

  it("prefers the exact-edition row when BOTH an exact and a NULL row are present", () => {
    const rows: Row[] = [
      { id: "shared", edition: null },
      { id: "exact-2014", edition: "EDITION_2014" },
    ];
    expect(resolveEditionRow(rows, "EDITION_2014")?.id).toBe("exact-2014");
    // The order they're passed in shouldn't matter.
    expect(resolveEditionRow([...rows].reverse(), "EDITION_2014")?.id).toBe("exact-2014");
  });

  it("the worked example: Alert forks by edition, Grappler stays one shared row", () => {
    const alert: Row[] = [
      { id: "alert-2014", edition: "EDITION_2014" },
      { id: "alert-2024", edition: "EDITION_2024" },
    ];
    const grappler: Row[] = [{ id: "grappler-shared", edition: null }];

    expect(resolveEditionRow(alert, "EDITION_2014")?.id).toBe("alert-2014");
    expect(resolveEditionRow(alert, "EDITION_2024")?.id).toBe("alert-2024");
    expect(resolveEditionRow(grappler, "EDITION_2014")?.id).toBe("grappler-shared");
    expect(resolveEditionRow(grappler, "EDITION_2024")?.id).toBe("grappler-shared");
  });
});

describe("editionOrShared", () => {
  it("builds an OR fragment matching the exact edition or the NULL row", () => {
    expect(editionOrShared("EDITION_2014")).toEqual({
      OR: [{ edition: "EDITION_2014" }, { edition: null }],
    });
  });
});
