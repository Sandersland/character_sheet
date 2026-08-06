// #1715 (content slice of epic #1517): shape + cross-check invariants for the
// Cleric by-class spell bucket. Pure data tests on the array itself — same
// pattern as spells-2014-shared-data.test.ts (#1713) and
// spells-2014-wizard-data.test.ts (#1714) — because the DB round-trip (one
// Spell row per name, SpellClass fan-out, `?class=` resolution) is already
// proven generically by spell-fork-reseed.test.ts (#1710) and spells.test.ts's
// SpellClass-join describe blocks (#1711); this file's only job is to prove
// THIS SLICE'S DATA is correct, not re-prove the plumbing.
import { describe, expect, it } from "vitest";

import type { CatalogSpell } from "../spells.js";
import { CLERIC_SPELLS_2014 } from "../spells-2014/cleric.js";
import { WIZARD_SPELLS_2014 } from "../spells-2014/wizard.js";
import { SHARED_SPELLS_2014 } from "../spells-2014/shared.js";

const CLASS_ROSTER = new Set(["wizard", "cleric", "druid", "bard", "sorcerer", "warlock", "paladin", "ranger"]);

// Forbiddance and Spirit Guardians are this slice's two exceptions to
// "damageType iff effectKind 'damage'": each one's damage type is a CHOICE
// made outside the caster picking a fixed value at authoring time —
// Forbiddance lets the caster pick radiant-or-necrotic every time it's cast,
// Spirit Guardians resolves to radiant or necrotic based on the caster's
// alignment — so effectKind is still "damage" (dice are real, fixed values)
// but damageType is intentionally absent. Mirrors wizard.ts's Chromatic
// Orb/Fire Shield precedent.
const DAMAGE_TYPE_EXCEPTIONS = new Set(["Forbiddance", "Spirit Guardians"]);

function duplicates(names: string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const n of names) {
    if (seen.has(n)) dupes.add(n);
    seen.add(n);
  }
  return [...dupes];
}

describe("CLERIC_SPELLS_2014 — row-ownership rule (epic #1517)", () => {
  it("is non-empty and clears a sane floor (the whole point of this slice)", () => {
    // Not an exact count — future refinement can still add/move rows — but a
    // regression that silently emptied the array (e.g. a bad merge) must fail
    // loudly rather than pass an "empty array has no bad rows" vacuous green.
    expect(CLERIC_SPELLS_2014.length).toBeGreaterThanOrEqual(40);
  });

  it("every row sits on 1-2 classes (3+ belongs in shared.ts instead), each lowercase and a real class name", () => {
    const bad = CLERIC_SPELLS_2014.filter(
      (s) => s.classes.length < 1 || s.classes.length > 2 || s.classes.some((c) => c !== c.toLowerCase() || !CLASS_ROSTER.has(c)),
    ).map((s) => s.name);
    expect(bad, "rows on 3+ lists (shared.ts's territory), or with an unknown/uppercased class, don't belong in this slice").toEqual([]);
  });

  it("every row includes cleric in its own classes (this slice's whole reason to exist)", () => {
    const bad = CLERIC_SPELLS_2014.filter((s) => !s.classes.includes("cleric")).map((s) => s.name);
    expect(bad).toEqual([]);
  });

  it("cleric is always listed FIRST in classes (owner-class convention, matches wizard.ts's precedent)", () => {
    const bad = CLERIC_SPELLS_2014.filter((s) => s.classes[0] !== "cleric").map((s) => s.name);
    expect(bad).toEqual([]);
  });

  it("no row here also includes wizard — a wizard+cleric spell is WIZARD's territory (higher tie-break priority), not this slice's", () => {
    const bad = CLERIC_SPELLS_2014.filter((s) => s.classes.includes("wizard")).map((s) => s.name);
    expect(bad, "a row on both wizard's and cleric's lists must be authored in wizard.ts, membership-only here").toEqual([]);
  });

  it("every row is authored exactly once — no duplicate names within this slice", () => {
    expect(duplicates(CLERIC_SPELLS_2014.map((s) => s.name))).toEqual([]);
  });

  it("no row here is ALSO authored in shared.ts or wizard.ts — the row-ownership rule forbids re-transcribing a row owned elsewhere", () => {
    const sharedNames = new Set(SHARED_SPELLS_2014.map((s) => s.name));
    const wizardNames = new Set(WIZARD_SPELLS_2014.map((s) => s.name));
    const overlapShared = CLERIC_SPELLS_2014.filter((s) => sharedNames.has(s.name)).map((s) => s.name);
    const overlapWizard = CLERIC_SPELLS_2014.filter((s) => wizardNames.has(s.name)).map((s) => s.name);
    expect(overlapShared, "a name authored in BOTH cleric.ts and shared.ts is a row-ownership violation, not just a duplicate").toEqual([]);
    expect(overlapWizard, "a name authored in BOTH cleric.ts and wizard.ts is a row-ownership violation, not just a duplicate").toEqual([]);
  });

  it("no row hardcodes its own edition — index.ts's SPELLS_2014 default is the only place that sets it", () => {
    const tagged = CLERIC_SPELLS_2014.filter((s) => s.edition !== undefined).map((s) => s.name);
    expect(tagged, "a row-level edition tag here would still work, but none of this slice's rows are edition-specific within 2014").toEqual([]);
  });
});

describe("CLERIC_SPELLS_2014 — structured-field invariants (mirrors wizard.ts's #1714 block)", () => {
  it("cantripScaling only on cantrips (level 0)", () => {
    const bad = CLERIC_SPELLS_2014.filter((s) => s.cantripScaling && s.level !== 0).map((s) => s.name);
    expect(bad, "leveled spell flagged cantripScaling").toEqual([]);
  });

  it("saveEffect implies a save-based attack", () => {
    const bad = CLERIC_SPELLS_2014.filter((s) => s.saveEffect && s.attackType !== "save").map((s) => s.name);
    expect(bad, "saveEffect without attackType 'save'").toEqual([]);
  });

  it("saveEffect only appears on a damage row (shared.ts's own convention)", () => {
    const bad = CLERIC_SPELLS_2014.filter((s) => s.saveEffect && s.effectKind !== "damage").map((s) => s.name);
    expect(bad, "saveEffect set on a non-damage row").toEqual([]);
  });

  it("upcastDicePerLevel only on leveled spells (level >= 1)", () => {
    const bad = CLERIC_SPELLS_2014.filter((s) => s.upcastDicePerLevel != null && s.level < 1).map((s) => s.name);
    expect(bad, "cantrip with upcastDicePerLevel").toEqual([]);
  });

  it("effectKind 'damage'/'heal' rows carry dice; utility rows carry none", () => {
    const bad = CLERIC_SPELLS_2014.filter((s) => {
      const hasDice = s.effectDiceCount != null && s.effectDiceFaces != null;
      const isRoll = s.effectKind === "damage" || s.effectKind === "heal";
      return hasDice !== isRoll;
    }).map((s) => s.name);
    expect(bad, "dice fields not matching a damage/heal effectKind").toEqual([]);
  });

  it("damageType appears iff effectKind is 'damage' (except the documented caster-chosen-type exceptions)", () => {
    const bad = CLERIC_SPELLS_2014.filter(
      (s) => !DAMAGE_TYPE_EXCEPTIONS.has(s.name) && (s.damageType != null) !== (s.effectKind === "damage"),
    ).map((s) => s.name);
    expect(bad, "damageType present without effectKind 'damage', or vice versa").toEqual([]);
  });
});

// The critical lesson from a prior content slice (CLAUDE.md): a row's
// STRUCTURED saveEffect must match its own DESCRIPTION prose, or the frontend
// shows "half on success" text that contradicts (or omits) what the spell
// actually does. Every damage spell in this file is checked against its own
// text, not spot-checked.
describe("CLERIC_SPELLS_2014 — saveEffect matches its own description text (field/text mismatch guard)", () => {
  const HALF_ON_SUCCESS = /half as much damage|half damage|half the damage/i;

  it("saveEffect 'half' rows say so in their own description", () => {
    const bad = CLERIC_SPELLS_2014.filter((s) => s.saveEffect === "half" && !HALF_ON_SUCCESS.test(s.description)).map((s) => s.name);
    expect(bad, "saveEffect:'half' but description never says half-on-success").toEqual([]);
  });

  it("save-based damage rows WITHOUT saveEffect:'half' never claim half-on-success in prose", () => {
    const bad = CLERIC_SPELLS_2014.filter(
      (s) => s.effectKind === "damage" && s.attackType === "save" && s.saveEffect !== "half" && HALF_ON_SUCCESS.test(s.description),
    ).map((s) => s.name);
    expect(bad, "description claims half-on-success but saveEffect isn't 'half'").toEqual([]);
  });
});

// A rules-accuracy pass on the Wizard slice found dnd5eapi's own damage/dc
// JSON has real gaps (Flaming Sphere, Scorching Ray, Weird — dc/attack_type/
// damage null despite the prose clearly describing one). This slice hit the
// same gap class twice (Sanctuary, Spirit Guardians — see cleric.ts's own row
// comments), so this describe block audits the PROSE directly against every
// row's structured fields — the same sweep that found those gaps — as a
// permanent regression guard, not a one-time spot-check.
describe("CLERIC_SPELLS_2014 — prose-vs-structured-field audit (catches what dnd5eapi's own JSON gaps hid)", () => {
  // Rows where a save/attack/damage-shaped phrase in the prose is NOT the
  // row's own primary structured effect — each has its own comment at the row
  // explaining why (a buff granting advantage on FUTURE saves rather than a
  // save against this spell itself, a conditional/reactive save, a
  // self-inflicted drawback, or a multi-branch spell with no single
  // resolution). Every one of these was individually reviewed, not
  // bulk-excluded.
  const CONDITIONAL_OR_MULTI_EFFECT = new Set([
    "Beacon of Hope", // grants ADVANTAGE on future wisdom/death saves — not a save against this spell
    "Bless", // grants a d4 bonus to a FUTURE attack roll/save — not a save against this spell
    "Contagion", // the melee spell attack applies the disease; the recurring CON saves only end it early or lock it in
    "Dispel Evil and Good", // Break Enchantment (no roll) vs. Dismissal (melee attack + save) — two branches, no single attackType
    "Flame Strike", // fire AND radiant in one instance, no single damageType (matches Meteor Swarm precedent)
    "Heroes' Feast", // grants ADVANTAGE on future wisdom saves — not a save against this spell
    "Holy Aura", // grants advantage on saves (buff); the CON save only triggers on an attacker who melee-hits an affected creature
    "Meld Into Stone", // the 6d6/50 bludgeoning damage is a conditional self-inflicted drawback if the stone is destroyed, not this spell's own effect
    "Resistance", // grants a d4 bonus to a FUTURE saving throw of the target's choice — not a save against this spell
    "Resurrection", // the -4 penalty / disadvantage is a narrative drawback on the REVIVED creature, not a save against Resurrection
    "Warding Bond", // grants a flat +1 AC/save bonus alongside damage resistance and a two-way damage link — not a save against this spell
  ]);

  it("every row mentioning 'saving throw' has attackType 'save', unless documented as conditional/multi-effect", () => {
    const bad = CLERIC_SPELLS_2014.filter(
      (s) => !CONDITIONAL_OR_MULTI_EFFECT.has(s.name) && /saving throw/i.test(s.description) && s.attackType !== "save",
    ).map((s) => s.name);
    expect(bad, "prose describes a saving throw but attackType isn't 'save'").toEqual([]);
  });

  it("every row mentioning '(melee|ranged) spell attack' has attackType 'attack', unless documented as conditional/multi-effect", () => {
    const bad = CLERIC_SPELLS_2014.filter(
      (s) => !CONDITIONAL_OR_MULTI_EFFECT.has(s.name) && /\b(melee|ranged)\s+spell\s+attack/i.test(s.description) && s.attackType !== "attack",
    ).map((s) => s.name);
    expect(bad, "prose describes a spell attack but attackType isn't 'attack'").toEqual([]);
  });

  it("every attackType:'save' row has a saveAbility", () => {
    const bad = CLERIC_SPELLS_2014.filter((s) => s.attackType === "save" && !s.saveAbility).map((s) => s.name);
    expect(bad).toEqual([]);
  });

  it("every row with an 'XdY <type> damage' phrase in prose has effectKind 'damage', unless documented as conditional/multi-effect", () => {
    const bad = CLERIC_SPELLS_2014.filter((s) => {
      if (CONDITIONAL_OR_MULTI_EFFECT.has(s.name) || DAMAGE_TYPE_EXCEPTIONS.has(s.name)) return false;
      return /\d+d\d+[^.]{0,40}?damage/i.test(s.description) && s.effectKind !== "damage";
    }).map((s) => s.name);
    expect(bad, "prose describes dice damage but effectKind isn't 'damage'").toEqual([]);
  });
});

describe("CLERIC_SPELLS_2014 — scraping-artifact guards (same shapes spells-2014-shared-data.test.ts / spells-2014-wizard-data.test.ts found live)", () => {
  it("no row carries the dnd5eapi 'GM' genericization or its 'o f'/'10d 10' scraping artifacts", () => {
    const bad = CLERIC_SPELLS_2014.filter((s) => /\bGM\b/.test(s.description) || /\bo f\b/.test(s.description) || /\d+d \d+/.test(s.description)).map(
      (s) => s.name,
    );
    expect(bad).toEqual([]);
  });

  it("no description repeats a whole word back-to-back (e.g. 'bright light bright light'), or carries a stray 'depending on the model' translation artifact", () => {
    const bad = CLERIC_SPELLS_2014.filter((s) => {
      const dupedWordPhrase = /\b(\w+ \w+)\b \1\b/i.test(s.description);
      const translationArtifact = /depending on the model/i.test(s.description);
      return dupedWordPhrase || translationArtifact;
    }).map((s) => s.name);
    expect(bad).toEqual([]);
  });

  it("no description ends a sentence on a bare 'level N.'/'slot N.' (a broken-ordinal artifact)", () => {
    const bad = CLERIC_SPELLS_2014.filter((s) => /\b(?:level|slot)s?\s+\d+\.(?:\s|$)/i.test(s.description)).map((s) => s.name);
    expect(bad).toEqual([]);
  });

  it("no description repeats the exact same sentence back to back", () => {
    const bad = CLERIC_SPELLS_2014.filter((s) => {
      const sentences = s.description.split(/(?<=[.!?])\s+/).map((sentence) => sentence.trim()).filter(Boolean);
      return sentences.some((sentence, i) => i > 0 && sentence === sentences[i - 1]);
    }).map((s) => s.name);
    expect(bad).toEqual([]);
  });

  it("no description carries a literal markdown pipe table or bold-heading asterisks (SpellDetailCard has no markdown parser)", () => {
    const bad = CLERIC_SPELLS_2014.filter((s) => /\|/.test(s.description) || /\*/.test(s.description)).map((s) => s.name);
    expect(bad).toEqual([]);
  });
});

// #1746: an audit of every pre-#1717 2014 slice for the same dropped-tail bug
// PR #1745's review found in Heroism (dnd5eapi's higher_level JSON can be
// empty despite the real SRD 5.1 text carrying an "At Higher Levels" clause).
// Ground truth below was cross-checked against 5etools' PHB spell dataset
// (its entriesHigherLevel field, hand-transcribed from the book): every one
// of this slice's 41 leveled rows was checked, and none was found missing a
// genuine upcast clause.
describe("CLERIC_SPELLS_2014 — no dropped 'At Higher Levels' tail text (dnd5eapi JSON-vs-real-SRD-text gap, #1746)", () => {
  const HAS_AT_HIGHER_LEVELS_TEXT = new Set([
    "Bane",
    "Bless",
    "Command",
    "Create or Destroy Water",
    "Guiding Bolt",
    "Inflict Wounds",
    "Aid",
    "Prayer of Healing",
    "Spiritual Weapon",
    "Mass Healing Word",
    "Spirit Guardians",
    "Flame Strike",
    "Heal",
    "Conjure Celestial",
  ]);

  it("every row verified to have real SRD 'At Higher Levels' text actually carries it in its description", () => {
    const missing = [...HAS_AT_HIGHER_LEVELS_TEXT].filter((name) => !/At Higher Levels\./.test(find(name).description));
    expect(missing, "a row with verified upcast text is missing its 'At Higher Levels' sentence").toEqual([]);
  });

  it("no OTHER row in this slice claims 'At Higher Levels' text it wasn't verified to have (catches an accidental copy-paste in the other direction)", () => {
    const unexpected = CLERIC_SPELLS_2014.filter(
      (s) => !HAS_AT_HIGHER_LEVELS_TEXT.has(s.name) && /At Higher Levels\./.test(s.description),
    ).map((s) => s.name);
    expect(unexpected).toEqual([]);
  });
});

function find(name: string): CatalogSpell {
  const s = CLERIC_SPELLS_2014.find((sp) => sp.name === name);
  if (!s) throw new Error(`CLERIC_SPELLS_2014 has no "${name}"`);
  return s;
}

// Spot-checks on the trickiest edge cases this slice hand-authored — not
// exhaustive (46 rows), but enough to catch a transcription or transform
// regression on the rows most likely to be touched again.
describe("CLERIC_SPELLS_2014 — value spot-checks", () => {
  it("Sacred Flame: DEX save, no benefit from cover, 1d8 radiant, cantrip-scales", () => {
    const s = find("Sacred Flame");
    expect(s.classes).toEqual(["cleric"]);
    expect(s.attackType).toBe("save");
    expect(s.saveAbility).toBe("dexterity");
    expect(s.saveEffect).toBe("none");
    expect(s.effectKind).toBe("damage");
    expect(s.effectDiceCount).toBe(1);
    expect(s.effectDiceFaces).toBe(8);
    expect(s.damageType).toBe("radiant");
    expect(s.cantripScaling).toBe(true);
  });

  it("Guiding Bolt: ranged spell attack, 4d6 radiant + upcast", () => {
    const s = find("Guiding Bolt");
    expect(s.attackType).toBe("attack");
    expect(s.effectKind).toBe("damage");
    expect(s.effectDiceCount).toBe(4);
    expect(s.effectDiceFaces).toBe(6);
    expect(s.damageType).toBe("radiant");
    expect(s.upcastDicePerLevel).toBe(1);
  });

  it("Sanctuary: WIS save gates a would-be attacker choosing a new target — dnd5eapi's own dc field was null despite the prose", () => {
    const s = find("Sanctuary");
    expect(s.attackType).toBe("save");
    expect(s.saveAbility).toBe("wisdom");
    expect(s.effectKind).toBeUndefined();
  });

  it("Spirit Guardians: WIS save, half on success, 3d8 + upcast — dnd5eapi's own dc AND damage fields were both null despite the prose; damageType unset (radiant if good/neutral, necrotic if evil)", () => {
    const s = find("Spirit Guardians");
    expect(s.attackType).toBe("save");
    expect(s.saveAbility).toBe("wisdom");
    expect(s.saveEffect).toBe("half");
    expect(s.effectKind).toBe("damage");
    expect(s.effectDiceCount).toBe(3);
    expect(s.effectDiceFaces).toBe(8);
    expect(s.damageType).toBeUndefined();
    expect(s.upcastDicePerLevel).toBe(1);
  });

  it("Flame Strike: fire AND radiant in one instance can't fit one damageType, so it stays a utility row (matches Meteor Swarm precedent)", () => {
    const s = find("Flame Strike");
    expect(s.effectKind).toBeUndefined();
    expect(s.attackType).toBe("save");
    expect(s.saveAbility).toBe("dexterity");
    expect(s.saveEffect).toBeUndefined();
    expect(s.description).toMatch(/4d6 fire damage and 4d6 radiant damage/);
  });

  it("Forbiddance: automatic (no attack/save) 5d10 damage, caster-chosen type each cast — damageType unset", () => {
    const s = find("Forbiddance");
    expect(s.attackType).toBeUndefined();
    expect(s.effectKind).toBe("damage");
    expect(s.effectDiceCount).toBe(5);
    expect(s.effectDiceFaces).toBe(10);
    expect(s.damageType).toBeUndefined();
  });

  it("Guardian of Faith: flat 20 radiant damage (not dice) stays a utility row despite the DEX save/half prose, matching Aid's flat-heal precedent", () => {
    const s = find("Guardian of Faith");
    expect(s.attackType).toBe("save");
    expect(s.saveAbility).toBe("dexterity");
    expect(s.effectKind).toBeUndefined();
    expect(s.description).toMatch(/20 radiant damage/);
  });

  it("Aid, Heal, Mass Heal: flat (non-dice) healing amounts stay utility rows, matching the 2024 SPELLS row's own Aid precedent", () => {
    for (const name of ["Aid", "Heal", "Mass Heal"]) {
      const s = find(name);
      expect(s.effectKind, `${name} should have no effectKind (flat heal, not dice)`).toBeUndefined();
    }
  });

  it("Shield of Faith: flat +2 AC buff, matches the 2024 SPELLS row's own buffTarget precedent exactly", () => {
    const s = find("Shield of Faith");
    expect(s.effectKind).toBe("buff");
    expect(s.buffTarget).toBe("ac");
    expect(s.buffModifier).toBe(2);
  });

  it("Spiritual Weapon: melee spell attack, 1d8 force — upcastDicePerLevel deliberately UNSET (PHB'14's real rate is every TWO slot levels, not one; reusing the 2024 SPELLS row's upcastDicePerLevel:1 here would edition-mix)", () => {
    const s = find("Spiritual Weapon");
    expect(s.attackType).toBe("attack");
    expect(s.effectKind).toBe("damage");
    expect(s.effectDiceCount).toBe(1);
    expect(s.effectDiceFaces).toBe(8);
    expect(s.damageType).toBe("force");
    expect(s.upcastDicePerLevel).toBeUndefined();
    expect(s.description).toMatch(/every two slot levels above the 2nd/);
  });

  it("Mass Healing Word and Prayer of Healing: dice heals ('+ your spellcasting ability modifier' carried in prose, not a separate field)", () => {
    const mhw = find("Mass Healing Word");
    expect(mhw.effectKind).toBe("heal");
    expect(mhw.effectDiceCount).toBe(1);
    expect(mhw.effectDiceFaces).toBe(4);
    expect(mhw.upcastDicePerLevel).toBe(1);

    const poh = find("Prayer of Healing");
    expect(poh.effectKind).toBe("heal");
    expect(poh.effectDiceCount).toBe(2);
    expect(poh.effectDiceFaces).toBe(8);
    expect(poh.upcastDicePerLevel).toBe(1);
  });

  it("Bane and Bless are 2-list (Bard/Paladin + Cleric) — authored here (Cleric outranks both in the tie-break), NOT the other class's territory", () => {
    expect(find("Bane").classes).toEqual(["cleric", "bard"]);
    expect(find("Bless").classes).toEqual(["cleric", "paladin"]);
  });

  it("Hallow's 'such as ores or trolls' is the official SRD 5.1 text verbatim, not a scraping artifact of this repo's own pipeline", () => {
    expect(find("Hallow").description).toMatch(/such as ores or trolls/);
  });
});
