// Pure unit tests for resolveEditionRow (#1306) — the single place the
// exact-edition-then-NULL-fallback ordering is expressed for the five
// edition-tagged catalogs (Feat, Subclass, GrantedAbility, Action, Background).
import { describe, expect, it } from "vitest";

import { crossEditionRejection, resolveEditionCatalog, resolveEditionRow, withEditionOrShared } from "@/lib/rules/catalog-edition.js";

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
    const keyOf = (r: NamedRow) => r.name;
    const for2014 = resolveEditionCatalog(rows, "EDITION_2014", keyOf);
    const for2024 = resolveEditionCatalog(rows, "EDITION_2024", keyOf);

    expect(for2014.map((r) => r.id).sort()).toEqual(["alert-2014", "grappler-shared"]);
    expect(for2024.map((r) => r.id).sort()).toEqual(["alert-2024", "grappler-shared"]);
  });

  it("drops a key entirely when no row matches the given edition", () => {
    const rows: NamedRow[] = [{ name: "Only2024", id: "x", edition: "EDITION_2024" }];
    expect(resolveEditionCatalog(rows, "EDITION_2014", (r) => r.name)).toEqual([]);
  });

  it("keys on more than name when keyOf says so (Subclass's real key is classId+name)", () => {
    interface SubclassLikeRow {
      classId: string;
      name: string;
      id: string;
      edition: "EDITION_2014" | "EDITION_2024" | null;
    }
    // Same name, different classes — a name-only key would wrongly collapse these.
    const rows: SubclassLikeRow[] = [
      { classId: "fighter", name: "Champion", id: "fighter-champion", edition: null },
      { classId: "monk", name: "Champion", id: "monk-champion", edition: null },
    ];
    const resolved = resolveEditionCatalog(rows, "EDITION_2024", (r) => `${r.classId}::${r.name}`);
    expect(resolved.map((r) => r.id).sort()).toEqual(["fighter-champion", "monk-champion"]);
  });
});

describe("crossEditionRejection", () => {
  it("rejects a 2014 row against a 2024 character, naming both labels", () => {
    const msg = crossEditionRejection({ edition: "EDITION_2014" }, 'Feat "Mobile"', "EDITION_2024");
    expect(msg).not.toBeNull();
    expect(msg).toMatch(/2014 rules/);
    expect(msg).toMatch(/2024 rules/);
  });

  it("rejects a 2024 row against a 2014 character (symmetry)", () => {
    const msg = crossEditionRejection({ edition: "EDITION_2024" }, 'Feat "Mobile"', "EDITION_2014");
    expect(msg).not.toBeNull();
    expect(msg).toMatch(/2014 rules/);
    expect(msg).toMatch(/2024 rules/);
  });

  it("accepts a NULL-edition (shared) row for a 2014 character", () => {
    expect(crossEditionRejection({ edition: null }, 'Feat "Mobile"', "EDITION_2014")).toBeNull();
  });

  it("accepts a NULL-edition (shared) row for a 2024 character", () => {
    expect(crossEditionRejection({ edition: null }, 'Feat "Mobile"', "EDITION_2024")).toBeNull();
  });

  it("accepts a same-edition row (2014)", () => {
    expect(crossEditionRejection({ edition: "EDITION_2014" }, 'Feat "Mobile"', "EDITION_2014")).toBeNull();
  });

  it("accepts a same-edition row (2024)", () => {
    expect(crossEditionRejection({ edition: "EDITION_2024" }, 'Feat "Mobile"', "EDITION_2024")).toBeNull();
  });
});

describe("withEditionOrShared", () => {
  it("builds an AND-wrapped OR fragment matching the exact edition or the NULL row", () => {
    expect(withEditionOrShared({ name: "Alert" }, "EDITION_2014")).toEqual({
      AND: [{ name: "Alert" }, { OR: [{ edition: "EDITION_2014" }, { edition: null }] }],
    });
  });

  it("composing it does not clobber a sibling `OR` on the caller's where", () => {
    const callerWhere = { name: "Alert", OR: [{ category: "origin" }, { category: "general" }] };
    const composed = withEditionOrShared(callerWhere, "EDITION_2024");
    expect(composed).toEqual({
      AND: [
        { name: "Alert", OR: [{ category: "origin" }, { category: "general" }] },
        { OR: [{ edition: "EDITION_2024" }, { edition: null }] },
      ],
    });
    // The caller's own OR survives intact, nested inside the outer AND.
    expect(composed.AND[0]).toBe(callerWhere);
  });

  it("composing it does not clobber a sibling `AND` on the caller's where — the exact regression a spreadable fragment hit", () => {
    const callerWhere = { name: "Alert", AND: [{ category: "general" }] };
    const composed = withEditionOrShared(callerWhere, "EDITION_2014");
    expect(composed).toEqual({
      AND: [
        { name: "Alert", AND: [{ category: "general" }] },
        { OR: [{ edition: "EDITION_2014" }, { edition: null }] },
      ],
    });
    // The caller's own AND survives intact, nested inside the outer AND —
    // a spreadable `{...where, ...fragment}` shape would have overwritten
    // this key with the fragment's own AND instead.
    expect(composed.AND[0]).toBe(callerWhere);
  });
});
