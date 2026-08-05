// #1714 (content slice of epic #1517): shape + cross-check invariants for the
// Wizard by-class spell bucket. Pure data tests on the array itself — same
// pattern as spells-2014-shared-data.test.ts (#1713) — because the DB
// round-trip (one Spell row per name, SpellClass fan-out, `?class=`
// resolution) is already proven generically by spell-fork-reseed.test.ts
// (#1710) and spells.test.ts's SpellClass-join describe blocks (#1711); this
// file's only job is to prove THIS SLICE'S DATA is correct, not re-prove the
// plumbing.
import { describe, expect, it } from "vitest";

import type { CatalogSpell } from "../spells.js";
import { WIZARD_SPELLS_2014 } from "../spells-2014/wizard.js";
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

describe("WIZARD_SPELLS_2014 — row-ownership rule (epic #1517)", () => {
  it("is non-empty and clears a sane floor (the whole point of this slice)", () => {
    // Not an exact count — future refinement can still add/move rows — but a
    // regression that silently emptied the array (e.g. a bad merge) must fail
    // loudly rather than pass an "empty array has no bad rows" vacuous green.
    expect(WIZARD_SPELLS_2014.length).toBeGreaterThanOrEqual(90);
  });

  it("every row sits on 1-2 classes (3+ belongs in shared.ts instead), each lowercase and a real class name", () => {
    const bad = WIZARD_SPELLS_2014.filter(
      (s) => s.classes.length < 1 || s.classes.length > 2 || s.classes.some((c) => c !== c.toLowerCase() || !CLASS_ROSTER.has(c)),
    ).map((s) => s.name);
    expect(bad, "rows on 3+ lists (shared.ts's territory), or with an unknown/uppercased class, don't belong in this slice").toEqual([]);
  });

  it("every row includes wizard in its own classes (this slice's whole reason to exist)", () => {
    const bad = WIZARD_SPELLS_2014.filter((s) => !s.classes.includes("wizard")).map((s) => s.name);
    expect(bad).toEqual([]);
  });

  it("wizard is always listed FIRST in classes (owner-class convention, matches shared.ts's Chill Touch/Light precedent)", () => {
    const bad = WIZARD_SPELLS_2014.filter((s) => s.classes[0] !== "wizard").map((s) => s.name);
    expect(bad).toEqual([]);
  });

  it("every row is authored exactly once — no duplicate names within this slice", () => {
    expect(duplicates(WIZARD_SPELLS_2014.map((s) => s.name))).toEqual([]);
  });

  it("no row here is ALSO authored in shared.ts — the row-ownership rule forbids re-transcribing a 3+-list spell", () => {
    const sharedNames = new Set(SHARED_SPELLS_2014.map((s) => s.name));
    const overlap = WIZARD_SPELLS_2014.filter((s) => sharedNames.has(s.name)).map((s) => s.name);
    expect(overlap, "a name authored in BOTH files is a row-ownership violation, not just a duplicate").toEqual([]);
  });

  it("no row hardcodes its own edition — index.ts's SPELLS_2014 default is the only place that sets it", () => {
    const tagged = WIZARD_SPELLS_2014.filter((s) => s.edition !== undefined).map((s) => s.name);
    expect(tagged, "a row-level edition tag here would still work, but none of this slice's rows are edition-specific within 2014").toEqual([]);
  });
});

describe("WIZARD_SPELLS_2014 — structured-field invariants (mirrors SPELLS' #1132 block)", () => {
  it("cantripScaling only on cantrips (level 0)", () => {
    const bad = WIZARD_SPELLS_2014.filter((s) => s.cantripScaling && s.level !== 0).map((s) => s.name);
    expect(bad, "leveled spell flagged cantripScaling").toEqual([]);
  });

  it("saveEffect implies a save-based attack", () => {
    const bad = WIZARD_SPELLS_2014.filter((s) => s.saveEffect && s.attackType !== "save").map((s) => s.name);
    expect(bad, "saveEffect without attackType 'save'").toEqual([]);
  });

  it("saveEffect only appears on a damage row (shared.ts's own convention — verified against its 12 saveEffect rows)", () => {
    const bad = WIZARD_SPELLS_2014.filter((s) => s.saveEffect && s.effectKind !== "damage").map((s) => s.name);
    expect(bad, "saveEffect set on a non-damage row").toEqual([]);
  });

  it("upcastDicePerLevel only on leveled spells (level >= 1)", () => {
    const bad = WIZARD_SPELLS_2014.filter((s) => s.upcastDicePerLevel != null && s.level < 1).map((s) => s.name);
    expect(bad, "cantrip with upcastDicePerLevel").toEqual([]);
  });

  it("effectKind 'damage'/'heal' rows carry dice; utility rows carry none", () => {
    const bad = WIZARD_SPELLS_2014.filter((s) => {
      const hasDice = s.effectDiceCount != null && s.effectDiceFaces != null;
      const isRoll = s.effectKind === "damage" || s.effectKind === "heal";
      return hasDice !== isRoll;
    }).map((s) => s.name);
    expect(bad, "dice fields not matching a damage/heal effectKind").toEqual([]);
  });

  it("damageType appears iff effectKind is 'damage'", () => {
    const bad = WIZARD_SPELLS_2014.filter((s) => (s.damageType != null) !== (s.effectKind === "damage")).map((s) => s.name);
    expect(bad, "damageType present without effectKind 'damage', or vice versa").toEqual([]);
  });
});

// The critical lesson from a prior content slice (CLAUDE.md): a row's
// STRUCTURED saveEffect must match its own DESCRIPTION prose, or the frontend
// shows "half on success" text that contradicts (or omits) what the spell
// actually does. Every damage spell in this file is checked against its own
// text, not spot-checked.
describe("WIZARD_SPELLS_2014 — saveEffect matches its own description text (field/text mismatch guard)", () => {
  const HALF_ON_SUCCESS = /half as much damage|half damage|half the damage/i;

  it("saveEffect 'half' rows say so in their own description", () => {
    const bad = WIZARD_SPELLS_2014.filter((s) => s.saveEffect === "half" && !HALF_ON_SUCCESS.test(s.description)).map((s) => s.name);
    expect(bad, "saveEffect:'half' but description never says half-on-success").toEqual([]);
  });

  it("save-based damage rows WITHOUT saveEffect:'half' never claim half-on-success in prose", () => {
    const bad = WIZARD_SPELLS_2014.filter(
      (s) => s.effectKind === "damage" && s.attackType === "save" && s.saveEffect !== "half" && HALF_ON_SUCCESS.test(s.description),
    ).map((s) => s.name);
    expect(bad, "description claims half-on-success but saveEffect isn't 'half'").toEqual([]);
  });
});

describe("WIZARD_SPELLS_2014 — scraping-artifact guards (same shapes spells-2014-shared-data.test.ts found live)", () => {
  it("no row carries the dnd5eapi 'GM' genericization or its 'o f'/'10d 10' scraping artifacts", () => {
    const bad = WIZARD_SPELLS_2014.filter((s) => /\bGM\b/.test(s.description) || /\bo f\b/.test(s.description) || /\d+d \d+/.test(s.description)).map(
      (s) => s.name,
    );
    expect(bad).toEqual([]);
  });

  it("no description ends a sentence on a bare 'level N.'/'slot N.' (a broken-ordinal artifact)", () => {
    const bad = WIZARD_SPELLS_2014.filter((s) => /\b(?:level|slot)s?\s+\d+\.(?:\s|$)/i.test(s.description)).map((s) => s.name);
    expect(bad).toEqual([]);
  });

  it("no description repeats the exact same sentence back to back", () => {
    const bad = WIZARD_SPELLS_2014.filter((s) => {
      const sentences = s.description.split(/(?<=[.!?])\s+/).map((sentence) => sentence.trim()).filter(Boolean);
      return sentences.some((sentence, i) => i > 0 && sentence === sentences[i - 1]);
    }).map((s) => s.name);
    expect(bad).toEqual([]);
  });

  it("no description carries a literal markdown pipe table or bold-heading asterisks (SpellDetailCard has no markdown parser)", () => {
    const bad = WIZARD_SPELLS_2014.filter((s) => /\|/.test(s.description) || /\*/.test(s.description)).map((s) => s.name);
    expect(bad).toEqual([]);
  });
});

function find(name: string): CatalogSpell {
  const s = WIZARD_SPELLS_2014.find((sp) => sp.name === name);
  if (!s) throw new Error(`WIZARD_SPELLS_2014 has no "${name}"`);
  return s;
}

// Spot-checks on the trickiest edge cases this slice hand-authored or
// hand-transcribed — not exhaustive (100 rows), but enough to catch a
// transcription or transform regression on the rows most likely to be
// touched again.
describe("WIZARD_SPELLS_2014 — value spot-checks", () => {
  it("Melf's Acid Arrow: PHB'14's real title (dnd5eapi serves it as 'Acid Arrow'), wizard-exclusive, 4d4 acid + upcast", () => {
    const s = find("Melf's Acid Arrow");
    expect(s.classes).toEqual(["wizard"]);
    expect(s.effectKind).toBe("damage");
    expect(s.damageType).toBe("acid");
    expect(s.effectDiceCount).toBe(4);
    expect(s.effectDiceFaces).toBe(4);
    expect(s.attackType).toBe("attack");
    expect(s.upcastDicePerLevel).toBe(1);
  });

  it("Chromatic Orb: PHB'14-only (not in dnd5eapi), caster-chosen damage type stays a utility row (no single damageType)", () => {
    const s = find("Chromatic Orb");
    expect(s.level).toBe(1);
    expect(s.classes).toEqual(["wizard", "sorcerer"]);
    expect(s.effectKind).toBeUndefined();
    expect(s.description).toMatch(/3d8 damage of the type you chose/);
  });

  it("Meteor Swarm: fire AND bludgeoning in one instance can't fit one damageType, so it stays a utility row (matches Ice Storm precedent)", () => {
    const s = find("Meteor Swarm");
    expect(s.effectKind).toBeUndefined();
    expect(s.attackType).toBe("save");
    expect(s.saveEffect).toBeUndefined();
    expect(s.description).toMatch(/20d6 fire damage and 20d6 bludgeoning damage/);
  });

  it("Wall of Ice: 10d6 cold, +2d6 per slot level above 6th", () => {
    const s = find("Wall of Ice");
    expect(s.effectDiceCount).toBe(10);
    expect(s.effectDiceFaces).toBe(6);
    expect(s.damageType).toBe("cold");
    expect(s.upcastDicePerLevel).toBe(2);
  });

  it("Mage Armor: while-active AC buff (acUnarmoredBase 13), matches the 2024 SPELLS row's own precedent", () => {
    const s = find("Mage Armor");
    expect(s.effectKind).toBe("buff");
    expect(s.buffTarget).toBe("acUnarmoredBase");
    expect(s.buffModifier).toBe(13);
  });

  it("Shield: reaction AC buff is NOT modeled via buffTarget (matches the 2024 SPELLS row's own precedent — 1-round reactions aren't the generic buff resolver's job)", () => {
    const s = find("Shield");
    expect(s.effectKind).toBeUndefined();
    expect(s.buffTarget).toBeUndefined();
  });

  it("Trap the Soul: PHB'14-only, wizard-exclusive, Charisma save, no damage", () => {
    const s = find("Trap the Soul");
    expect(s.classes).toEqual(["wizard"]);
    expect(s.attackType).toBe("save");
    expect(s.saveAbility).toBe("charisma");
    expect(s.effectKind).toBeUndefined();
  });

  it("Telepathy: PHB'14-only, wizard-exclusive, pure utility (no attack/save)", () => {
    const s = find("Telepathy");
    expect(s.classes).toEqual(["wizard"]);
    expect(s.level).toBe(8);
    expect(s.attackType).toBeUndefined();
  });

  it("Ray of Sickness: PHB'14-only, attack-roll damage unconditional on the hit (the CON save only gates the poisoned status)", () => {
    const s = find("Ray of Sickness");
    expect(s.attackType).toBe("attack");
    expect(s.effectKind).toBe("damage");
    expect(s.damageType).toBe("poison");
    expect(s.saveEffect).toBeUndefined();
  });

  it("Prismatic Spray: 8 rays each roll a different type (chosen per-ray), so it stays a utility row despite dealing damage", () => {
    const s = find("Prismatic Spray");
    expect(s.effectKind).toBeUndefined();
    expect(s.attackType).toBe("save");
    expect(s.saveEffect).toBeUndefined();
  });

  it("Creation: the source's markdown duration-by-material table reads as prose, not literal pipe characters", () => {
    const s = find("Creation");
    expect(s.description).not.toMatch(/\|/);
    expect(s.description).toMatch(/1 day for vegetable matter/i);
  });

  it("Fireball and Magic Missile are 2-list (Sorcerer+Wizard only in PHB'14) — authored here, NOT shared.ts's territory", () => {
    expect(find("Fireball").classes).toEqual(["wizard", "sorcerer"]);
    expect(find("Magic Missile").classes).toEqual(["wizard", "sorcerer"]);
  });
});
