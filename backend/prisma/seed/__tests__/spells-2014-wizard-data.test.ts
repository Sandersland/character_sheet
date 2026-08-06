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

// Chromatic Orb and Fire Shield are the two deliberate exceptions to
// "damageType iff effectKind 'damage'": each one's damage type is the
// CASTER'S CHOICE (6 options for Chromatic Orb, warm-vs-chill for Fire
// Shield), not a spell-level constant, so effectKind is still "damage"
// (dice are real, fixed values) but damageType is intentionally absent —
// there's no single correct value to put there. Shared at module scope
// since both the field invariant and the prose-audit describe blocks below
// need the same exception list.
const DAMAGE_TYPE_EXCEPTIONS = new Set(["Chromatic Orb", "Fire Shield"]);

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

  it("damageType appears iff effectKind is 'damage' (except the documented caster-chosen-type exceptions)", () => {
    const bad = WIZARD_SPELLS_2014.filter(
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

// A rules-accuracy pass found dnd5eapi's own damage/dc JSON has real gaps —
// Flaming Sphere and Scorching Ray had dc/attack_type: null despite their
// prose clearly describing a save/attack, and Weird had damage: null
// despite describing unconditional 4d10 psychic damage (the API simply
// failed to structure them, unlike the mechanically-identical Phantasmal
// Killer). derive-wizard.mjs's "trust the API's own fields" approach can't
// catch what the API itself dropped, so this describe block audits the
// PROSE directly against every row's structured fields — the same sweep
// that found 5 more gaps (Levitate, Web, Otto's Irresistible Dance,
// Antipathy/Sympathy, Contact Other Plane) beyond the first 4 — as a
// permanent regression guard, not a one-time spot-check.
describe("WIZARD_SPELLS_2014 — prose-vs-structured-field audit (catches what dnd5eapi's own JSON gaps hid)", () => {
  // Rows where a damage/attack-shaped phrase in the prose is NOT the row's
  // own primary structured effect — each has its own comment at the row
  // explaining why (conditional/optional branch, weapon-damage buff, a
  // per-ray/per-layer choice, or a narrative drawback unrelated to casting
  // the spell itself). Every one of these was individually reviewed, not
  // bulk-excluded.
  const CONDITIONAL_OR_MULTI_EFFECT = new Set([
    "Alter Self", // Natural Weapons is one of 3 selectable forms, chosen type
    "Enlarge/Reduce", // 1d4 extra/less damage is a WEAPON-ATTACK buff, not a spell effect
    "Bigby's Hand", // Clenched Fist is one of 4 selectable actions per turn
    "Prismatic Wall", // 7 layers, each a different save ability AND damage type
    "Wish", // 1d10/spell-level is a stress DRAWBACK on future casts, not Wish's own effect
    "Meteor Swarm", // fire AND bludgeoning in one instance, no single damageType
    "Prismatic Spray", // 8 rays, each a different type chosen per-ray
    "Ray of Enfeeblement", // attack roll applies the debuff; the CON save only ends it early
    "Ray of Sickness", // attack roll deals damage unconditionally; CON save only gates "poisoned"
    "Web", // the restrain save is structured; 2d4 fire is a conditional "if set alight" bonus
    "Haste", // "advantage on dexterity saving throws" is a BUFF it grants, not a save against Haste
    "Shapechange", // "saving throw proficiencies" is prose about what you retain, not a save
  ]);

  it("every row mentioning 'saving throw' has attackType 'save', unless documented as conditional/multi-effect", () => {
    const bad = WIZARD_SPELLS_2014.filter(
      (s) => !CONDITIONAL_OR_MULTI_EFFECT.has(s.name) && /saving throw/i.test(s.description) && s.attackType !== "save",
    ).map((s) => s.name);
    expect(bad, "prose describes a saving throw but attackType isn't 'save'").toEqual([]);
  });

  it("every row mentioning '(melee|ranged) spell attack' has attackType 'attack', unless documented as conditional/multi-effect", () => {
    const bad = WIZARD_SPELLS_2014.filter(
      (s) => !CONDITIONAL_OR_MULTI_EFFECT.has(s.name) && /\b(melee|ranged)\s+spell\s+attack/i.test(s.description) && s.attackType !== "attack",
    ).map((s) => s.name);
    expect(bad, "prose describes a spell attack but attackType isn't 'attack'").toEqual([]);
  });

  it("every attackType:'save' row has a saveAbility", () => {
    const bad = WIZARD_SPELLS_2014.filter((s) => s.attackType === "save" && !s.saveAbility).map((s) => s.name);
    expect(bad).toEqual([]);
  });

  it("every row with an 'XdY <type> damage' phrase in prose has effectKind 'damage', unless documented as conditional/multi-effect", () => {
    const bad = WIZARD_SPELLS_2014.filter((s) => {
      if (CONDITIONAL_OR_MULTI_EFFECT.has(s.name) || DAMAGE_TYPE_EXCEPTIONS.has(s.name)) return false;
      return /\d+d\d+[^.]{0,40}?damage/i.test(s.description) && s.effectKind !== "damage";
    }).map((s) => s.name);
    expect(bad, "prose describes dice damage but effectKind isn't 'damage'").toEqual([]);
  });
});

describe("WIZARD_SPELLS_2014 — scraping-artifact guards (same shapes spells-2014-shared-data.test.ts found live)", () => {
  it("no row carries the dnd5eapi 'GM' genericization or its 'o f'/'10d 10' scraping artifacts", () => {
    const bad = WIZARD_SPELLS_2014.filter((s) => /\bGM\b/.test(s.description) || /\bo f\b/.test(s.description) || /\d+d \d+/.test(s.description)).map(
      (s) => s.name,
    );
    expect(bad).toEqual([]);
  });

  // Fire Shield's dnd5eapi source had a duplicated "bright light bright
  // light" phrase and a garbled, un-parseable sentence that reads like a
  // French-to-English machine-translation artifact ("depending on the
  // model" for what should be "depending on the shield you chose") — caught
  // by the mandatory rules-accuracy pass. Guarded here so a future dnd5eapi
  // re-scrape can't quietly reintroduce either shape.
  it("no description repeats a whole word back-to-back (e.g. 'bright light bright light'), or carries a stray 'depending on the model' translation artifact", () => {
    const bad = WIZARD_SPELLS_2014.filter((s) => {
      const dupedWordPhrase = /\b(\w+ \w+)\b \1\b/i.test(s.description);
      const translationArtifact = /depending on the model/i.test(s.description);
      return dupedWordPhrase || translationArtifact;
    }).map((s) => s.name);
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

// #1746: an audit of every pre-#1717 2014 slice for the same dropped-tail bug
// PR #1745's review found in Heroism (dnd5eapi's higher_level JSON can be
// empty despite the real SRD 5.1 text carrying an "At Higher Levels" clause).
// Ground truth below was cross-checked against 5etools' PHB spell dataset
// (its entriesHigherLevel field, hand-transcribed from the book): every one
// of this slice's 95 leveled rows was checked, and none was found missing a
// genuine upcast clause.
describe("WIZARD_SPELLS_2014 — no dropped 'At Higher Levels' tail text (dnd5eapi JSON-vs-real-SRD-text gap, #1746)", () => {
  const HAS_AT_HIGHER_LEVELS_TEXT = new Set([
    "Burning Hands",
    "Chromatic Orb",
    "Color Spray",
    "False Life",
    "Magic Missile",
    "Ray of Sickness",
    "Flaming Sphere",
    "Magic Weapon",
    "Melf's Acid Arrow",
    "Scorching Ray",
    "Animate Dead",
    "Fireball",
    "Lightning Bolt",
    "Vampiric Touch",
    "Conjure Minor Elementals",
    "Mordenkainen's Private Sanctum",
    "Phantasmal Killer",
    "Bigby's Hand",
    "Cloudkill",
    "Cone of Cold",
    "Conjure Elemental",
    "Creation",
    "Modify Memory",
    "Chain Lightning",
    "Disintegrate",
    "Globe of Invulnerability",
    "Otiluke's Freezing Sphere",
    "Wall of Ice",
    "Delayed Blast Fireball",
  ]);

  it("every row verified to have real SRD 'At Higher Levels' text actually carries it in its description", () => {
    const missing = [...HAS_AT_HIGHER_LEVELS_TEXT].filter((name) => !/At Higher Levels\./.test(find(name).description));
    expect(missing, "a row with verified upcast text is missing its 'At Higher Levels' sentence").toEqual([]);
  });

  it("no OTHER row in this slice claims 'At Higher Levels' text it wasn't verified to have (catches an accidental copy-paste in the other direction)", () => {
    const unexpected = WIZARD_SPELLS_2014.filter(
      (s) => !HAS_AT_HIGHER_LEVELS_TEXT.has(s.name) && /At Higher Levels\./.test(s.description),
    ).map((s) => s.name);
    expect(unexpected).toEqual([]);
  });
});

function find(name: string): CatalogSpell {
  const s = WIZARD_SPELLS_2014.find((sp) => sp.name === name);
  if (!s) throw new Error(`WIZARD_SPELLS_2014 has no "${name}"`);
  return s;
}

// Spot-checks on the trickiest edge cases this slice hand-authored or
// hand-transcribed — not exhaustive (99 rows), but enough to catch a
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

  it("Chromatic Orb: EEPC/Xanathar's (NOT PHB'14 core), 3d8 + upcast, no leap-on-doubles (that's the 2024 PHB version only)", () => {
    const s = find("Chromatic Orb");
    expect(s.level).toBe(1);
    expect(s.classes).toEqual(["wizard", "sorcerer"]);
    expect(s.attackType).toBe("attack");
    expect(s.effectKind).toBe("damage");
    expect(s.effectDiceCount).toBe(3);
    expect(s.effectDiceFaces).toBe(8);
    expect(s.upcastDicePerLevel).toBe(1);
    // damageType is deliberately unset (caster's choice among 6 options) —
    // covered by the invariant test's DAMAGE_TYPE_EXCEPTIONS, not re-asserted here.
    expect(s.description).toMatch(/3d8 damage of the type you chose/);
    expect(s.description).not.toMatch(/leaps? to a new target/i);
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

  it("'Trap the Soul' does NOT exist in this catalog — it's a 3.5e spell, not 5e (the mandatory rules-accuracy pass caught an earlier draft's fabrication); the 5e soul-trapping mechanic lives inside Imprisonment's Minimus Containment option instead", () => {
    expect(WIZARD_SPELLS_2014.find((s) => s.name === "Trap the Soul")).toBeUndefined();
    expect(find("Imprisonment").description).toMatch(/Minimus Containment/);
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

  it("Flaming Sphere: DEX save, half on success, 2d6 fire + upcast — dnd5eapi's own dc field was null despite the prose", () => {
    const s = find("Flaming Sphere");
    expect(s.attackType).toBe("save");
    expect(s.saveAbility).toBe("dexterity");
    expect(s.saveEffect).toBe("half");
    expect(s.effectDiceCount).toBe(2);
    expect(s.effectDiceFaces).toBe(6);
    expect(s.damageType).toBe("fire");
    expect(s.upcastDicePerLevel).toBe(1);
  });

  it("Scorching Ray: ranged spell attack per ray, 2d6 fire — dnd5eapi's own attack_type field was null despite the prose", () => {
    const s = find("Scorching Ray");
    expect(s.attackType).toBe("attack");
    expect(s.effectKind).toBe("damage");
    expect(s.effectDiceCount).toBe(2);
    expect(s.effectDiceFaces).toBe(6);
    expect(s.damageType).toBe("fire");
  });

  it("Weird: the mass Phantasmal Killer — 4d10 psychic, saveEffect 'none', hand-added since dnd5eapi's own damage field was null (unlike Phantasmal Killer's identical mechanic)", () => {
    const s = find("Weird");
    expect(s.attackType).toBe("save");
    expect(s.saveAbility).toBe("wisdom");
    expect(s.saveEffect).toBe("none");
    expect(s.effectKind).toBe("damage");
    expect(s.effectDiceCount).toBe(4);
    expect(s.effectDiceFaces).toBe(10);
    expect(s.damageType).toBe("psychic");
  });

  it("Fire Shield: 2d8 damage, warm-vs-chill is the caster's choice (no fixed damageType), no scraping-artifact text survives", () => {
    const s = find("Fire Shield");
    expect(s.effectKind).toBe("damage");
    expect(s.effectDiceCount).toBe(2);
    expect(s.effectDiceFaces).toBe(8);
    expect(s.damageType).toBeUndefined();
    expect(s.description).not.toMatch(/bright light bright light/i);
    expect(s.description).not.toMatch(/depending on the model/i);
  });

  it("Levitate: an unwilling target resists with a CON save — no damage, dnd5eapi's own dc field was null despite the prose", () => {
    const s = find("Levitate");
    expect(s.attackType).toBe("save");
    expect(s.saveAbility).toBe("constitution");
    expect(s.effectKind).toBeUndefined();
  });

  it("Web: DEX save to avoid being restrained (the 2d4 fire is a conditional 'if set alight' bonus, not the default effect)", () => {
    const s = find("Web");
    expect(s.attackType).toBe("save");
    expect(s.saveAbility).toBe("dexterity");
    expect(s.effectKind).toBeUndefined();
  });

  it("Otto's Irresistible Dance: WIS save to regain control — no damage, dnd5eapi's own dc field was null despite the prose", () => {
    const s = find("Otto's Irresistible Dance");
    expect(s.attackType).toBe("save");
    expect(s.saveAbility).toBe("wisdom");
    expect(s.effectKind).toBeUndefined();
  });

  it("Antipathy/Sympathy: WIS save (either aura) — no damage, dnd5eapi's own dc field was null despite the prose", () => {
    const s = find("Antipathy/Sympathy");
    expect(s.attackType).toBe("save");
    expect(s.saveAbility).toBe("wisdom");
    expect(s.effectKind).toBeUndefined();
  });

  it("Contact Other Plane: 6d6 psychic on a failed INT save, saveEffect 'none' — hand-added since dnd5eapi's own damage field was null (same gap class as Weird)", () => {
    const s = find("Contact Other Plane");
    expect(s.attackType).toBe("save");
    expect(s.saveAbility).toBe("intelligence");
    expect(s.saveEffect).toBe("none");
    expect(s.effectKind).toBe("damage");
    expect(s.effectDiceCount).toBe(6);
    expect(s.effectDiceFaces).toBe(6);
    expect(s.damageType).toBe("psychic");
  });
});
