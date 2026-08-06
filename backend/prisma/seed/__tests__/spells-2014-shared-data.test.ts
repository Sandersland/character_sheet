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
// hand-authored — not exhaustive (144 rows), but enough to catch a transcription
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
    // Regression guard: an earlier draft of this row invented a "moves more
    // than 30 feet away and doesn't return by end of turn" end condition
    // that doesn't exist in the real spell, dropping the genuine second end
    // condition (total cover) in the process — caught by the mandatory
    // rules-accuracy pass, re-verified word-for-word against dnd5e.wikidot.com.
    expect(s.description).toMatch(
      /The spell also ends if the target is ever outside the spell's range or if it has total cover from you\./,
    );
    expect(s.description).not.toMatch(/doesn't return to that range/);
  });

  // #1719 (Warlock) added these three rows: all genuine PHB'14 4-list
  // spells (Bard/Sorcerer/Warlock/Wizard) missing from every prior slice
  // entirely, not API-derived — dnd5eapi/open5e's SRD 5.1 dataset doesn't
  // carry any of them — so they're hand-transcribed and get their own
  // spot-checks, each cross-checked word-for-word against a second source
  // (dnd5e.wikidot.com).
  it("Friends: no Verbal component (S + M only — unusual for a cantrip), Concentration duration, no attackType/effectKind (self-buff only)", () => {
    const s = find("Friends");
    expect(s.level).toBe(0);
    expect(s.concentration).toBe(true);
    expect(s.classes).toEqual(["wizard", "bard", "sorcerer", "warlock"]);
    expect(s.components).toEqual({
      verbal: false,
      somatic: true,
      material: true,
      materialDescription: "a small amount of makeup applied to the face as this spell is cast",
    });
    expect(s.attackType).toBeUndefined();
    expect(s.effectKind).toBeUndefined();
  });

  it("Cloud of Daggers: automatic 4d4 slashing (no attack/save — matches Magic Missile's shape), +2d4 per upcast level", () => {
    const s = find("Cloud of Daggers");
    expect(s.level).toBe(2);
    expect(s.concentration).toBe(true);
    expect(s.classes).toEqual(["wizard", "bard", "sorcerer", "warlock"]);
    expect(s.effectKind).toBe("damage");
    expect(s.effectDiceCount).toBe(4);
    expect(s.effectDiceFaces).toBe(4);
    expect(s.damageType).toBe("slashing");
    expect(s.attackType).toBeUndefined();
    expect(s.upcastDicePerLevel).toBe(2);
  });

  it("Crown of Madness: WIS save gates a forced-attack charm, no effectKind (control spell, not damage)", () => {
    const s = find("Crown of Madness");
    expect(s.level).toBe(2);
    expect(s.concentration).toBe(true);
    expect(s.classes).toEqual(["wizard", "bard", "sorcerer", "warlock"]);
    expect(s.attackType).toBe("save");
    expect(s.saveAbility).toBe("wisdom");
    expect(s.effectKind).toBeUndefined();
  });

  // #1742: Protection from Energy was never actually missing (5 classes
  // correctly fanned) — the row just had a stray title-cased "From" that
  // dnd5eapi's own casing doesn't carry ("Protection from Energy" per
  // dnd5eapi.co/api/2014/spells/protection-from-energy and PHB'14 p. 270).
  // Regression guard for the miscapitalization, not a content change.
  it("Protection from Energy: lowercase 'from' (not the stray 'From' this row previously carried)", () => {
    expect(find("Protection from Energy").name).toBe("Protection from Energy");
    expect(SHARED_SPELLS_2014.find((s) => s.name === "Protection From Energy")).toBeUndefined();
  });

  // #1742 closes the non-SRD-3+-list audit its own issue body opened (epic
  // #1517): dnd5eapi/open5e's SRD 5.1 dataset is SRD-only, so #1713's own
  // dnd5eapi-intersection approach was structurally blind to any PHB'14 spell
  // on 3+ of the 8 class lists that isn't SRD content — Witch Bolt/Friends/
  // Cloud of Daggers/Crown of Madness (#1718/#1719) were the first four found
  // this way; this slice's own audit (5etools' gendata-spell-source-lookup.json
  // class-access data, cross-checked against dnd5e.wikidot.com and 5etools'
  // raw spells-phb.json/spells-xphb.json) found these four more. All eight
  // are hand-transcribed, cited per-row above.
  it("Feign Death: PHB'14 p. 240, ritual, 3rd-level necromancy, Bard/Cleric/Druid/Wizard 4-list, all-damage resistance except psychic, no attackType/effectKind (status effect, not a save/damage roll)", () => {
    const s = find("Feign Death");
    expect(s.level).toBe(3);
    expect(s.school).toBe("necromancy");
    expect(s.ritual).toBe(true);
    expect(s.castingTime).toBe("1 action");
    expect(s.range).toBe("Touch");
    expect(s.duration).toBe("1 hour");
    expect(s.classes).toEqual(["wizard", "cleric", "druid", "bard"]);
    expect(s.components).toEqual({ verbal: true, somatic: true, material: true, materialDescription: "a pinch of graveyard dirt" });
    expect(s.attackType).toBeUndefined();
    expect(s.effectKind).toBeUndefined();
    expect(s.description).toMatch(/blinded/i);
    expect(s.description).toMatch(/incapacitated/i);
    expect(s.description).toMatch(/resistance to all damage except psychic damage/i);
  });

  // Phantasmal Force is 2nd-level Illusion in BOTH PHB'14 and the 2024 PHB —
  // cross-checked against 5etools' raw spells-phb.json/spells-xphb.json (both
  // report level 2) and dnd5e.wikidot.com/spell:phantasmal-force. #1742's own
  // issue body claimed a 1st-to-2nd level change across editions; that claim
  // doesn't hold up against either source and is NOT reproduced here — the
  // repo's existing 2024 row (spells.ts) already carries level 2 too, so
  // there is no edition fork on level, only on the per-round damage die
  // (1d6 in 2014 vs. 2024's 2d8, matching this repo's own SPELLS row).
  it("Phantasmal Force: PHB'14 p. 264, 2nd-level illusion (same level as 2024 — NOT a 1st-level PHB'14 spell), Bard/Sorcerer/Wizard 3-list, INT save gates the illusion, no effectKind (the 1d6/round damage is conditional on the target believing a harmful illusion, not the spell's unconditional primary effect)", () => {
    const s = find("Phantasmal Force");
    expect(s.level).toBe(2);
    expect(s.school).toBe("illusion");
    expect(s.concentration).toBe(true);
    expect(s.castingTime).toBe("1 action");
    expect(s.range).toBe("60 feet");
    expect(s.duration).toBe("Concentration, up to 1 minute");
    expect(s.classes).toEqual(["wizard", "bard", "sorcerer"]);
    expect(s.components).toEqual({ verbal: true, somatic: true, material: true, materialDescription: "a bit of fleece" });
    expect(s.attackType).toBe("save");
    expect(s.saveAbility).toBe("intelligence");
    expect(s.effectKind).toBeUndefined();
    expect(s.description).toMatch(/1d6 psychic damage/);
    expect(s.description).not.toMatch(/2d8/);
  });

  it("Arcane Gate: PHB'14 p. 214, 6th-level conjuration, Sorcerer/Warlock/Wizard 3-list, linked teleportation portals, no attackType/effectKind (pure utility)", () => {
    const s = find("Arcane Gate");
    expect(s.level).toBe(6);
    expect(s.school).toBe("conjuration");
    expect(s.concentration).toBe(true);
    expect(s.castingTime).toBe("1 action");
    expect(s.range).toBe("500 feet");
    expect(s.duration).toBe("Concentration, up to 10 minutes");
    expect(s.classes).toEqual(["wizard", "sorcerer", "warlock"]);
    expect(s.components).toEqual({ verbal: true, somatic: true, material: false });
    expect(s.attackType).toBeUndefined();
    expect(s.effectKind).toBeUndefined();
    expect(s.description).toMatch(/two.*portals|portals.*two/i);
  });

  it("Blade Ward: PHB'14 p. 218, abjuration cantrip, Bard/Sorcerer/Warlock/Wizard 4-list, self-only resistance to weapon damage, no effectKind (a resistance grant, not a dice roll — matches Protection from Energy's own shape)", () => {
    const s = find("Blade Ward");
    expect(s.level).toBe(0);
    expect(s.school).toBe("abjuration");
    expect(s.castingTime).toBe("1 action");
    expect(s.range).toBe("Self");
    expect(s.duration).toBe("1 round");
    expect(s.classes).toEqual(["wizard", "bard", "sorcerer", "warlock"]);
    expect(s.components).toEqual({ verbal: true, somatic: true, material: false });
    expect(s.concentration).toBeUndefined();
    expect(s.attackType).toBeUndefined();
    expect(s.effectKind).toBeUndefined();
    expect(s.cantripScaling).toBeUndefined();
    expect(s.description).toMatch(/resistance to bludgeoning, piercing, and slashing damage/i);
  });
});
