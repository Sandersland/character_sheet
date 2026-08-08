import { describe, expect, it } from "vitest";

import { isForkable, isForkedSpell, scopeBadgeLabel } from "@/lib/catalogProvenance";
import type { CatalogSpell } from "@/types/character";

const BASE: CatalogSpell = {
  id: "s1",
  name: "Fireball",
  level: 3,
  school: "evocation",
  castingTime: "1 action",
  range: "150 feet",
  duration: "Instantaneous",
  description: "A seeded spell.",
  concentration: false,
  ritual: false,
  classes: [],
  cantripScaling: false,
};

describe("scopeBadgeLabel", () => {
  it("returns null for a GLOBAL (seeded) row", () => {
    expect(scopeBadgeLabel({ ...BASE, catalog: { entryId: "e1", scope: "GLOBAL", isFork: false, forkedFromId: null, editable: false } })).toBeNull();
  });

  it("returns null when catalog metadata is absent (older fixture / not-yet-served row)", () => {
    expect(scopeBadgeLabel(BASE)).toBeNull();
  });

  it("labels the caller's own USER row 'My homebrew'", () => {
    const spell = { ...BASE, ownerId: "u1", catalog: { entryId: "e1", scope: "USER" as const, isFork: false, forkedFromId: null, editable: true } };
    expect(scopeBadgeLabel(spell)).toBe("My homebrew");
  });

  it("labels another member's granted USER row 'Shared homebrew'", () => {
    const spell = { ...BASE, catalog: { entryId: "e1", scope: "USER" as const, isFork: false, forkedFromId: null, editable: false } };
    expect(scopeBadgeLabel(spell)).toBe("Shared homebrew");
  });

  // #1815 review findings 2/10: the server used to leak the GRANTER's id as
  // `ownerId` on a granted (not owned) row, and the old implementation read
  // `ownerId` to decide "mine" — so a granted row would have wrongly shown
  // "My homebrew". Backend now nulls `ownerId` for a row the viewer doesn't
  // own (routes/catalog/spells.ts), but this function must be correct
  // EVEN IF a leaked ownerId ever reached it again — it reads only
  // `catalog.editable`, never `ownerId`.
  it("still labels a granted row 'Shared homebrew' even if ownerId carries the granter's id", () => {
    const spell = {
      ...BASE,
      ownerId: "granter-id",
      catalog: { entryId: "e1", scope: "USER" as const, isFork: false, forkedFromId: null, editable: false },
    };
    expect(scopeBadgeLabel(spell)).toBe("Shared homebrew");
  });

  it("labels a CAMPAIGN row 'Campaign homebrew'", () => {
    const spell = { ...BASE, catalog: { entryId: "e1", scope: "CAMPAIGN" as const, isFork: false, forkedFromId: null, editable: false } };
    expect(scopeBadgeLabel(spell)).toBe("Campaign homebrew");
  });
});

describe("isForkedSpell", () => {
  it("is true only when catalog.isFork is true", () => {
    expect(isForkedSpell({ ...BASE, catalog: { entryId: "e1", scope: "USER", isFork: true, forkedFromId: "origin", editable: true } })).toBe(true);
    expect(isForkedSpell({ ...BASE, catalog: { entryId: "e1", scope: "USER", isFork: false, forkedFromId: null, editable: true } })).toBe(false);
    expect(isForkedSpell(BASE)).toBe(false);
  });
});

describe("isForkable", () => {
  it("is false without catalog metadata", () => {
    expect(isForkable(BASE)).toBe(false);
  });

  it("is true for a row the caller doesn't own", () => {
    const spell = { ...BASE, catalog: { entryId: "e1", scope: "GLOBAL" as const, isFork: false, forkedFromId: null, editable: false } };
    expect(isForkable(spell)).toBe(true);
  });

  it("is false for the caller's own row (ownerId set) — Edit/Delete is the right action there, not Fork", () => {
    const spell = { ...BASE, ownerId: "u1", catalog: { entryId: "e1", scope: "USER" as const, isFork: false, forkedFromId: null, editable: true } };
    expect(isForkable(spell)).toBe(false);
  });

  // #1815 review findings 2/10: forkability must key off `catalog.editable`
  // alone — a granted row is forkable regardless of what `ownerId` says
  // (previously `ownerId === undefined` was the rule, which a leaked
  // granter id would defeat, hiding the Fork button on exactly the row this
  // epic's primary use case forks).
  it("is true for a granted (not owned) row even if ownerId carries the granter's id", () => {
    const spell = {
      ...BASE,
      ownerId: "granter-id",
      catalog: { entryId: "e1", scope: "USER" as const, isFork: false, forkedFromId: null, editable: false },
    };
    expect(isForkable(spell)).toBe(true);
  });
});
