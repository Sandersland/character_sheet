// #1713 (content slice CS of epic #1517): shape + cross-check invariants for
// the "3+ class list" shared spell bucket. Pure data tests on the array
// itself — same pattern as seed-data.test.ts's "SPELLS — structured-field
// invariants (#1132)" block — because the DB round-trip (one Spell row per
// name, SpellClass fan-out to every class, `?class=` resolution) is already
// proven generically by spell-fork-reseed.test.ts (#1710) and spells.test.ts's
// SpellClass-join describe blocks (#1711); this file's only job is to prove
// THIS SLICE'S DATA is correct, not re-prove the plumbing.
import { describe, expect, it } from "vitest";

import type { CatalogSpell } from "../spells.js";
import { SHARED_SPELLS_2014 } from "../spells-2014/shared.js";

const CLASS_ROSTER = new Set(["wizard", "cleric", "druid", "bard", "sorcerer", "warlock", "paladin", "ranger"]);

function duplicates(names: string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const n of names) {
    if (seen.has(n)) dupes.add(n);
    seen.add(n);
  }
  return [...dupes];
}

describe("SHARED_SPELLS_2014 — row-ownership rule (epic #1517)", () => {
  it("is non-empty and clears a sane floor (the whole point of this slice)", () => {
    // Not an exact count — future refinement can still add/move rows — but a
    // regression that silently emptied the array (e.g. a bad merge) must fail
    // loudly rather than pass an "empty array has no bad rows" vacuous green.
    expect(SHARED_SPELLS_2014.length).toBeGreaterThanOrEqual(130);
  });

  it("every row sits on 3 or more classes, each lowercase and a real class name", () => {
    const bad = SHARED_SPELLS_2014.filter(
      (s) => s.classes.length < 3 || s.classes.some((c) => c !== c.toLowerCase() || !CLASS_ROSTER.has(c)),
    ).map((s) => s.name);
    expect(bad, "rows below the 3-list threshold, or with an unknown/uppercased class, don't belong in the shared bucket").toEqual([]);
  });

  it("every row is authored exactly once — no duplicate names", () => {
    expect(duplicates(SHARED_SPELLS_2014.map((s) => s.name))).toEqual([]);
  });

  it("no row hardcodes its own edition — index.ts's SPELLS_2014 default is the only place that sets it", () => {
    const tagged = SHARED_SPELLS_2014.filter((s) => s.edition !== undefined).map((s) => s.name);
    expect(tagged, "a row-level edition tag here would still work, but none of this slice's rows are edition-specific within 2014").toEqual([]);
  });
});

describe("SHARED_SPELLS_2014 — structured-field invariants (mirrors SPELLS' #1132 block)", () => {
  it("cantripScaling only on cantrips (level 0)", () => {
    const bad = SHARED_SPELLS_2014.filter((s) => s.cantripScaling && s.level !== 0).map((s) => s.name);
    expect(bad, "leveled spell flagged cantripScaling").toEqual([]);
  });

  it("saveEffect implies a save-based attack", () => {
    const bad = SHARED_SPELLS_2014.filter((s) => s.saveEffect && s.attackType !== "save").map((s) => s.name);
    expect(bad, "saveEffect without attackType 'save'").toEqual([]);
  });

  it("upcastDicePerLevel only on leveled spells (level >= 1)", () => {
    const bad = SHARED_SPELLS_2014.filter((s) => s.upcastDicePerLevel != null && s.level < 1).map((s) => s.name);
    expect(bad, "cantrip with upcastDicePerLevel").toEqual([]);
  });

  it("effectKind 'damage'/'heal' rows carry dice; utility rows carry none", () => {
    const bad = SHARED_SPELLS_2014.filter((s) => {
      const hasDice = s.effectDiceCount != null && s.effectDiceFaces != null;
      const isRoll = s.effectKind === "damage" || s.effectKind === "heal";
      return hasDice !== isRoll;
    }).map((s) => s.name);
    expect(bad, "dice fields not matching a damage/heal effectKind").toEqual([]);
  });

  it("damageType appears iff effectKind is 'damage'", () => {
    const bad = SHARED_SPELLS_2014.filter((s) => (s.damageType != null) !== (s.effectKind === "damage")).map((s) => s.name);
    expect(bad, "damageType present without effectKind 'damage', or vice versa").toEqual([]);
  });
});

// The critical lesson from a prior content slice (CLAUDE.md): a row's
// STRUCTURED saveEffect must match its own DESCRIPTION prose, or the frontend
// shows "half on success" text that contradicts (or omits) what the spell
// actually does. Every damage spell in this file is checked against its own
// text, not spot-checked.
describe("SHARED_SPELLS_2014 — saveEffect matches its own description text (field/text mismatch guard)", () => {
  const HALF_ON_SUCCESS = /half as much damage|half damage|half the damage/i;

  it("saveEffect 'half' rows say so in their own description", () => {
    const bad = SHARED_SPELLS_2014.filter((s) => s.saveEffect === "half" && !HALF_ON_SUCCESS.test(s.description)).map((s) => s.name);
    expect(bad, "saveEffect:'half' but description never says half-on-success").toEqual([]);
  });

  it("save-based damage rows WITHOUT saveEffect:'half' never claim half-on-success in prose", () => {
    const bad = SHARED_SPELLS_2014.filter(
      (s) => s.effectKind === "damage" && s.attackType === "save" && s.saveEffect !== "half" && HALF_ON_SUCCESS.test(s.description),
    ).map((s) => s.name);
    expect(bad, "description claims half-on-success but saveEffect isn't 'half'").toEqual([]);
  });
});

function find(name: string): CatalogSpell {
  const s = SHARED_SPELLS_2014.find((sp) => sp.name === name);
  if (!s) throw new Error(`SHARED_SPELLS_2014 has no "${name}"`);
  return s;
}

// Spot-checks on the widest fan-outs and the trickiest edge cases this slice
// hand-authored — not exhaustive (137 rows), but enough to catch a transcription
// or transform regression on the spells most likely to be touched again.
describe("SHARED_SPELLS_2014 — value spot-checks", () => {
  it("Detect Magic: PHB'14's widest fan-out, all 7 casters that get it (no Warlock in 2014)", () => {
    const s = find("Detect Magic");
    expect(s.level).toBe(1);
    expect(s.concentration).toBe(true);
    expect(s.ritual).toBe(true);
    expect([...s.classes].sort()).toEqual(
      ["bard", "cleric", "druid", "paladin", "ranger", "sorcerer", "wizard"].sort(),
    );
  });

  it("Dispel Magic: 7 classes, no Ranger in PHB'14 (2024 added it)", () => {
    const s = find("Dispel Magic");
    expect(s.level).toBe(3);
    expect([...s.classes].sort()).toEqual(
      ["bard", "cleric", "druid", "paladin", "sorcerer", "warlock", "wizard"].sort(),
    );
    expect(s.classes).not.toContain("ranger");
  });

  it("Cure Wounds: PHB'14's 1d8 + mod base (NOT 2024's 2d8), +1d8 per upcast level", () => {
    const s = find("Cure Wounds");
    expect(s.effectKind).toBe("heal");
    expect(s.effectDiceCount).toBe(1);
    expect(s.effectDiceFaces).toBe(8);
    expect(s.upcastDicePerLevel).toBe(1);
  });

  it("Circle of Death: 8d6 necrotic, CON save, half on success, +2d6 per slot above 6th", () => {
    const s = find("Circle of Death");
    expect(s.effectKind).toBe("damage");
    expect(s.damageType).toBe("necrotic");
    expect(s.effectDiceCount).toBe(8);
    expect(s.effectDiceFaces).toBe(6);
    expect(s.attackType).toBe("save");
    expect(s.saveAbility).toBe("constitution");
    expect(s.saveEffect).toBe("half");
    expect(s.upcastDicePerLevel).toBe(2);
  });

  it("Feeblemind: damage is unconditional (dc_success 'other'), so saveEffect stays unset despite a save+damage row", () => {
    const s = find("Feeblemind");
    expect(s.effectKind).toBe("damage");
    expect(s.attackType).toBe("save");
    expect(s.saveAbility).toBe("intelligence");
    expect(s.saveEffect).toBeUndefined();
  });

  it("Ice Storm: mixed bludgeoning+cold damage can't fit one damageType, so it stays a utility row (matches the 2024 precedent)", () => {
    const s = find("Ice Storm");
    expect(s.effectKind).toBeUndefined();
    expect(s.description).toMatch(/2d8 bludgeoning damage and 4d6 cold damage/);
  });

  it("Sleep: the 5d8 roll has no damage type (it's an HP-pool, not damage), so it stays utility", () => {
    const s = find("Sleep");
    expect(s.effectKind).toBeUndefined();
    expect(s.classes).toEqual(["wizard", "bard", "sorcerer"]);
  });

  it("Confusion: the source's markdown d10 table reads as prose, not literal pipe characters", () => {
    const s = find("Confusion");
    expect(s.description).not.toMatch(/\|/);
    expect(s.description).toMatch(/on a 1, the creature uses all its movement/i);
  });

  it("no row carries the dnd5eapi 'GM' genericization or its 'o f'/'10d 10' scraping artifacts", () => {
    const bad = SHARED_SPELLS_2014.filter((s) => /\bGM\b/.test(s.description) || /\bo f\b/.test(s.description) || /\d+d \d+/.test(s.description)).map(
      (s) => s.name,
    );
    expect(bad).toEqual([]);
  });

  // #1740 review caught two more scraping artifacts live: Shatter's
  // higher_level text arrived from dnd5eapi as "...for each level of higher
  // spell slot 2." (a broken ordinal — should read "above 2nd"), and Wall of
  // Fire's desc paragraphs concatenated a sentence dnd5eapi repeats verbatim
  // ("The other side of the wall deals no damage." twice). Both classes of
  // artifact are checked over EVERY row, not spot-checked, so a by-class
  // slice (#1714-#1721) reusing this same dnd5eapi pipeline inherits the
  // guard rather than re-discovering these two the hard way.
  it("no description ends a sentence on a bare 'level N.'/'slot N.' (a broken-ordinal artifact, e.g. Shatter's 'higher spell slot 2.')", () => {
    const bad = SHARED_SPELLS_2014.filter((s) => /\b(?:level|slot)s?\s+\d+\.(?:\s|$)/i.test(s.description)).map((s) => s.name);
    expect(bad).toEqual([]);
  });

  it("no description repeats the exact same sentence back to back (Wall of Fire's doubled 'no damage' sentence)", () => {
    const bad = SHARED_SPELLS_2014.filter((s) => {
      const sentences = s.description.split(/(?<=[.!?])\s+/).map((sentence) => sentence.trim()).filter(Boolean);
      return sentences.some((sentence, i) => i > 0 && sentence === sentences[i - 1]);
    }).map((s) => s.name);
    expect(bad).toEqual([]);
  });

  // #1718 (Sorcerer) added this row: Witch Bolt is a genuine 3-list PHB'14
  // spell (Sorcerer/Warlock/Wizard) that was missing from every prior slice
  // entirely, not API-derived like the rest of this file — dnd5eapi/open5e's
  // SRD 5.1 dataset doesn't carry it — so it's hand-transcribed and gets its
  // own spot-check rather than relying on the generic API-sourced checks
  // above (which don't apply to a row with no API source).
  it("Witch Bolt: 1d12 lightning ranged spell attack, concentration, +1d12 per upcast level, Sorcerer/Warlock/Wizard", () => {
    const s = find("Witch Bolt");
    expect(s.level).toBe(1);
    expect(s.school).toBe("evocation");
    expect(s.concentration).toBe(true);
    expect(s.classes).toEqual(["wizard", "sorcerer", "warlock"]);
    expect(s.attackType).toBe("attack");
    expect(s.effectKind).toBe("damage");
    expect(s.effectDiceCount).toBe(1);
    expect(s.effectDiceFaces).toBe(12);
    expect(s.damageType).toBe("lightning");
    expect(s.upcastDicePerLevel).toBe(1);
    expect(s.components).toEqual({ verbal: true, somatic: true, material: true, materialDescription: "a twig from a tree that has been struck by lightning" });
  });
});
