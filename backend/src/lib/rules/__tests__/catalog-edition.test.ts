// Pure unit tests for resolveEditionRow (#1306) — the single place the
// exact-edition-then-NULL-fallback ordering is expressed for the five
// edition-tagged catalogs (Feat, Subclass, GrantedAbility, Action, Background).
import { describe, expect, it } from "vitest";

import { editionOrShared, resolveEditionCatalog, resolveEditionRow } from "@/lib/rules/catalog-edition.js";

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

describe("resolveEditionCatalog", () => {
  interface NamedRow {
    name: string;
    id: string;
    edition: "EDITION_2014" | "EDITION_2024" | null;
  }

  it("returns one row per name, each resolved per the given edition — the worked example, as a list", () => {
    const rows: NamedRow[] = [
      { name: "Alert", id: "alert-2014", edition: "EDITION_2014" },
      { name: "Alert", id: "alert-2024", edition: "EDITION_2024" },
      { name: "Grappler", id: "grappler-shared", edition: null },
    ];
    const for2014 = resolveEditionCatalog(rows, "EDITION_2014");
    const for2024 = resolveEditionCatalog(rows, "EDITION_2024");

    expect(for2014.map((r) => r.id).sort()).toEqual(["alert-2014", "grappler-shared"]);
    expect(for2024.map((r) => r.id).sort()).toEqual(["alert-2024", "grappler-shared"]);
  });

  it("drops a name entirely when no row matches the given edition", () => {
    const rows: NamedRow[] = [{ name: "Only2024", id: "x", edition: "EDITION_2024" }];
    expect(resolveEditionCatalog(rows, "EDITION_2014")).toEqual([]);
  });
});

describe("editionOrShared", () => {
  it("builds an AND-wrapped OR fragment matching the exact edition or the NULL row", () => {
    expect(editionOrShared("EDITION_2014")).toEqual({
      AND: [{ OR: [{ edition: "EDITION_2014" }, { edition: null }] }],
    });
  });

  it("spreading it alongside a sibling `where.OR` does not clobber that sibling", () => {
    const siblingOr = [{ name: "a" }, { name: "b" }];
    const where = { OR: siblingOr, ...editionOrShared("EDITION_2024") };
    expect(where.OR).toBe(siblingOr);
    expect(where.AND).toEqual([{ OR: [{ edition: "EDITION_2024" }, { edition: null }] }]);
  });
});
