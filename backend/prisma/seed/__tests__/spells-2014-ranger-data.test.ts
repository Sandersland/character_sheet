// #1721 (content slice of epic #1517, the LAST per-class content slice —
// #1722 closes the epic): shape + cross-check invariants for the Ranger
// by-class spell bucket. Pure data tests on the array itself — same pattern
// as spells-2014-shared-data.test.ts (#1713) through spells-2014-paladin-
// data.test.ts (#1720) — because the DB round-trip (one Spell row per name,
// SpellClass fan-out, `?class=` resolution) is already proven generically by
// spell-fork-reseed.test.ts (#1710) and spells.test.ts's SpellClass-join
// describe blocks (#1711); this file's only job is to prove THIS SLICE'S
// DATA is correct, not re-prove the plumbing.
import { describe, expect, it } from "vitest";

import type { CatalogSpell } from "../spells.js";
import { RANGER_SPELLS_2014 } from "../spells-2014/ranger.js";
import { WIZARD_SPELLS_2014 } from "../spells-2014/wizard.js";
import { CLERIC_SPELLS_2014 } from "../spells-2014/cleric.js";
import { DRUID_SPELLS_2014 } from "../spells-2014/druid.js";
import { BARD_SPELLS_2014 } from "../spells-2014/bard.js";
import { SORCERER_SPELLS_2014 } from "../spells-2014/sorcerer.js";
import { WARLOCK_SPELLS_2014 } from "../spells-2014/warlock.js";
import { PALADIN_SPELLS_2014 } from "../spells-2014/paladin.js";
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

describe("RANGER_SPELLS_2014 — row-ownership rule (epic #1517)", () => {
  it("is exactly the 8 rows this slice owns (8 Ranger-owned / 46 total PHB'14 Ranger spells — the other 38 are Wizard/Druid-owned or shared)", () => {
    expect(RANGER_SPELLS_2014.length).toBe(8);
  });

  it("every row sits on exactly 1 class (ranger) — Ranger is LAST in the tie-break, so any row on another class's list too belongs to that class instead", () => {
    const bad = RANGER_SPELLS_2014.filter(
      (s) => s.classes.length !== 1 || s.classes.some((c) => c !== c.toLowerCase() || !CLASS_ROSTER.has(c)),
    ).map((s) => s.name);
    expect(bad, "rows on 2+ lists, or with an unknown/uppercased class, need individual review against the tie-break").toEqual([]);
  });

  it("every row includes ranger in its own classes (this slice's whole reason to exist)", () => {
    const bad = RANGER_SPELLS_2014.filter((s) => !s.classes.includes("ranger")).map((s) => s.name);
    expect(bad).toEqual([]);
  });

  it("no row here also includes wizard, cleric, druid, bard, sorcerer, warlock, or paladin — such a spell is THEIR territory (higher tie-break priority), not this slice's", () => {
    const bad = RANGER_SPELLS_2014.filter(
      (s) =>
        s.classes.includes("wizard") ||
        s.classes.includes("cleric") ||
        s.classes.includes("druid") ||
        s.classes.includes("bard") ||
        s.classes.includes("sorcerer") ||
        s.classes.includes("warlock") ||
        s.classes.includes("paladin"),
    ).map((s) => s.name);
    expect(bad, "a row on a higher-priority class's list too must be authored there, membership-only here").toEqual([]);
  });

  it("every row is authored exactly once — no duplicate names within this slice", () => {
    expect(duplicates(RANGER_SPELLS_2014.map((s) => s.name))).toEqual([]);
  });

  it("no row here is ALSO authored in shared.ts, wizard.ts, cleric.ts, druid.ts, bard.ts, sorcerer.ts, warlock.ts, or paladin.ts — the row-ownership rule forbids re-transcribing a row owned elsewhere", () => {
    const sharedNames = new Set(SHARED_SPELLS_2014.map((s) => s.name));
    const wizardNames = new Set(WIZARD_SPELLS_2014.map((s) => s.name));
    const clericNames = new Set(CLERIC_SPELLS_2014.map((s) => s.name));
    const druidNames = new Set(DRUID_SPELLS_2014.map((s) => s.name));
    const bardNames = new Set(BARD_SPELLS_2014.map((s) => s.name));
    const sorcererNames = new Set(SORCERER_SPELLS_2014.map((s) => s.name));
    const warlockNames = new Set(WARLOCK_SPELLS_2014.map((s) => s.name));
    const paladinNames = new Set(PALADIN_SPELLS_2014.map((s) => s.name));
    const overlaps: Record<string, string[]> = {
      shared: RANGER_SPELLS_2014.filter((s) => sharedNames.has(s.name)).map((s) => s.name),
      wizard: RANGER_SPELLS_2014.filter((s) => wizardNames.has(s.name)).map((s) => s.name),
      cleric: RANGER_SPELLS_2014.filter((s) => clericNames.has(s.name)).map((s) => s.name),
      druid: RANGER_SPELLS_2014.filter((s) => druidNames.has(s.name)).map((s) => s.name),
      bard: RANGER_SPELLS_2014.filter((s) => bardNames.has(s.name)).map((s) => s.name),
      sorcerer: RANGER_SPELLS_2014.filter((s) => sorcererNames.has(s.name)).map((s) => s.name),
      warlock: RANGER_SPELLS_2014.filter((s) => warlockNames.has(s.name)).map((s) => s.name),
      paladin: RANGER_SPELLS_2014.filter((s) => paladinNames.has(s.name)).map((s) => s.name),
    };
    for (const [file, names] of Object.entries(overlaps)) {
      expect(names, `a name authored in BOTH ranger.ts and ${file}.ts is a row-ownership violation, not just a duplicate`).toEqual([]);
    }
  });

  it("no row hardcodes its own edition — index.ts's SPELLS_2014 default is the only place that sets it", () => {
    const tagged = RANGER_SPELLS_2014.filter((s) => s.edition !== undefined).map((s) => s.name);
    expect(tagged, "a row-level edition tag here would still work, but none of this slice's rows are edition-specific within 2014").toEqual([]);
  });
});

describe("RANGER_SPELLS_2014 — full PHB'14 Ranger membership is complete across all authoring slices", () => {
  // The full PHB'14 Ranger spell list (46 spells, levels 1-5 only — Ranger has
  // no cantrips and caps at 5th-level spells as a half-caster) partitioned by
  // which slice authors the row. Every name below must carry "ranger" in its
  // classes[] wherever it's actually authored — this test is the permanent
  // guard that the "already fanned" claim in ranger.ts's header holds, and
  // that the two gap rows this slice added to druid.ts (Beast Sense, Grasping
  // Vine) stay present.
  const DRUID_OWNED_RANGER_SPELLS = [
    "Goodberry",
    "Barkskin",
    "Pass without Trace",
    "Spike Growth",
    "Conjure Animals",
    "Wind Wall",
    "Conjure Woodland Beings",
    "Commune with Nature",
    "Tree Stride",
    "Beast Sense",
    "Grasping Vine",
  ];
  const WIZARD_OWNED_RANGER_SPELLS = ["Alarm"];
  const SHARED_OWNED_RANGER_SPELLS = [
    "Animal Friendship",
    "Cure Wounds",
    "Detect Magic",
    "Detect Poison and Disease",
    "Fog Cloud",
    "Jump",
    "Longstrider",
    "Speak with Animals",
    "Animal Messenger",
    "Darkvision",
    "Find Traps",
    "Lesser Restoration",
    "Locate Animals or Plants",
    "Locate Object",
    "Protection from Poison",
    "Silence",
    "Daylight",
    "Nondetection",
    "Plant Growth",
    "Protection from Energy",
    "Speak with Plants",
    "Water Breathing",
    "Water Walk",
    "Freedom of Movement",
    "Locate Creature",
    "Stoneskin",
  ];

  it("every Druid-owned spell Ranger also gets already carries ranger membership in druid.ts (membership-only, not re-authored here)", () => {
    const missing = DRUID_OWNED_RANGER_SPELLS.filter((name) => {
      const row = DRUID_SPELLS_2014.find((s) => s.name === name);
      return !row || !row.classes.includes("ranger");
    });
    expect(missing, "a Druid-owned Ranger spell missing its ranger membership tag in druid.ts").toEqual([]);
  });

  it("every Wizard-owned spell Ranger also gets already carries ranger membership in wizard.ts (membership-only, not re-authored here)", () => {
    const missing = WIZARD_OWNED_RANGER_SPELLS.filter((name) => {
      const row = WIZARD_SPELLS_2014.find((s) => s.name === name);
      return !row || !row.classes.includes("ranger");
    });
    expect(missing, "a Wizard-owned Ranger spell missing its ranger membership tag in wizard.ts").toEqual([]);
  });

  it("every shared (3+-list) spell Ranger also gets already carries ranger membership in shared.ts (membership-only, not re-authored here)", () => {
    const missing = SHARED_OWNED_RANGER_SPELLS.filter((name) => {
      const row = SHARED_SPELLS_2014.find((s) => s.name === name);
      return !row || !row.classes.includes("ranger");
    });
    expect(missing, "a shared Ranger spell missing its ranger membership tag in shared.ts").toEqual([]);
  });

  it("no Cleric-owned, Bard-owned, Sorcerer-owned, Warlock-owned, or Paladin-owned 2-list spell exists that Ranger also gets (all five outrank Ranger in the tie-break, so any such spell would be their territory, not a gap here) — all five carry zero ranger tags", () => {
    expect(CLERIC_SPELLS_2014.filter((s) => s.classes.includes("ranger")).map((s) => s.name)).toEqual([]);
    expect(BARD_SPELLS_2014.filter((s) => s.classes.includes("ranger")).map((s) => s.name)).toEqual([]);
    expect(SORCERER_SPELLS_2014.filter((s) => s.classes.includes("ranger")).map((s) => s.name)).toEqual([]);
    expect(WARLOCK_SPELLS_2014.filter((s) => s.classes.includes("ranger")).map((s) => s.name)).toEqual([]);
    expect(PALADIN_SPELLS_2014.filter((s) => s.classes.includes("ranger")).map((s) => s.name)).toEqual([]);
  });

  it("SHARED_SPELLS_2014's ranger-tagged row count plus the two owner slices' ranger-tagged counts plus this slice's own 8 rows equals the full 46-spell PHB'14 Ranger list", () => {
    const sharedRangerCount = SHARED_SPELLS_2014.filter((s) => s.classes.includes("ranger")).length;
    const total = sharedRangerCount + DRUID_OWNED_RANGER_SPELLS.length + WIZARD_OWNED_RANGER_SPELLS.length + RANGER_SPELLS_2014.length;
    expect(total).toBe(46);
  });

  it("no XGE addition (Zephyr Strike, Steel Wind Strike — both confirmed via dndbeyond's marketplace redirect landing on the Xanathar's Guide to Everything category, not Player's Handbook) is offered anywhere in the 2014 tables — this slice's membership check only counts genuine 2014 core-PHB Ranger-owned spells", () => {
    const allRows = [
      ...WIZARD_SPELLS_2014,
      ...CLERIC_SPELLS_2014,
      ...DRUID_SPELLS_2014,
      ...BARD_SPELLS_2014,
      ...SORCERER_SPELLS_2014,
      ...WARLOCK_SPELLS_2014,
      ...PALADIN_SPELLS_2014,
      ...RANGER_SPELLS_2014,
      ...SHARED_SPELLS_2014,
    ];
    for (const name of ["Zephyr Strike", "Steel Wind Strike"]) {
      const row = allRows.find((s) => s.name === name);
      expect(row?.classes.includes("ranger"), `${name} is XGE, not PHB'14 core — must not carry a ranger tag anywhere`).not.toBe(true);
      expect(RANGER_SPELLS_2014.find((s) => s.name === name), `${name} must not be authored in ranger.ts`).toBeUndefined();
    }
  });
});

describe("RANGER_SPELLS_2014 — structured-field invariants (mirrors wizard.ts/cleric.ts/druid.ts/bard.ts/sorcerer.ts/warlock.ts/paladin.ts's own blocks)", () => {
  it("cantripScaling only on cantrips (level 0) — Ranger has no cantrips at all", () => {
    const bad = RANGER_SPELLS_2014.filter((s) => s.cantripScaling).map((s) => s.name);
    expect(bad, "Ranger has no PHB'14 cantrips; no row should ever set cantripScaling").toEqual([]);
  });

  it("no row is level 0, 6, 7, 8, or 9 — Ranger has no cantrips and caps at 5th-level spells as a half-caster", () => {
    const bad = RANGER_SPELLS_2014.filter((s) => s.level === 0 || s.level > 5).map((s) => s.name);
    expect(bad, "a Ranger spell outside levels 1-5").toEqual([]);
  });

  it("saveEffect implies a save-based attack", () => {
    const bad = RANGER_SPELLS_2014.filter((s) => s.saveEffect && s.attackType !== "save").map((s) => s.name);
    expect(bad, "saveEffect without attackType 'save'").toEqual([]);
  });

  it("saveEffect only appears on a damage row (shared.ts's own convention)", () => {
    const bad = RANGER_SPELLS_2014.filter((s) => s.saveEffect && s.effectKind !== "damage").map((s) => s.name);
    expect(bad, "saveEffect set on a non-damage row").toEqual([]);
  });

  it("upcastDicePerLevel only on leveled spells (level >= 1)", () => {
    const bad = RANGER_SPELLS_2014.filter((s) => s.upcastDicePerLevel != null && s.level < 1).map((s) => s.name);
    expect(bad, "cantrip with upcastDicePerLevel").toEqual([]);
  });

  it("effectKind 'damage'/'heal' rows carry dice; utility rows carry none", () => {
    const bad = RANGER_SPELLS_2014.filter((s) => {
      const hasDice = s.effectDiceCount != null && s.effectDiceFaces != null;
      const isRoll = s.effectKind === "damage" || s.effectKind === "heal";
      return hasDice !== isRoll;
    }).map((s) => s.name);
    expect(bad, "dice fields not matching a damage/heal effectKind").toEqual([]);
  });

  it("damageType appears iff effectKind is 'damage' (this slice has zero direct-cast damage rows — every rider/trap/variable-type spell is a conditional/multi-effect exception)", () => {
    const bad = RANGER_SPELLS_2014.filter((s) => (s.damageType != null) !== (s.effectKind === "damage")).map((s) => s.name);
    expect(bad, "damageType present without effectKind 'damage', or vice versa").toEqual([]);
  });
});

// The critical lesson from a prior content slice (CLAUDE.md): a row's
// STRUCTURED saveEffect must match its own DESCRIPTION prose, or the frontend
// shows "half on success" text that contradicts (or omits) what the spell
// actually does. Every damage spell in this file is checked against its own
// text, not spot-checked.
describe("RANGER_SPELLS_2014 — saveEffect matches its own description text (field/text mismatch guard)", () => {
  const HALF_ON_SUCCESS = /half as much damage|half damage|half the damage/i;

  it("saveEffect 'half' rows say so in their own description (none in this slice — every save-for-half row is a documented multi-effect exception instead)", () => {
    const bad = RANGER_SPELLS_2014.filter((s) => s.saveEffect === "half" && !HALF_ON_SUCCESS.test(s.description)).map((s) => s.name);
    expect(bad, "saveEffect:'half' but description never says half-on-success").toEqual([]);
  });

  it("Hail of Thorns, Lightning Arrow, Conjure Barrage, Conjure Volley say half-on-success in prose despite having no saveEffect field (documented multi-effect exceptions — rider precondition or variable damage type)", () => {
    for (const name of ["Hail of Thorns", "Lightning Arrow", "Conjure Barrage", "Conjure Volley"]) {
      expect(HALF_ON_SUCCESS.test(find(name).description), `${name} should say half-on-success in prose`).toBe(true);
    }
  });
});

// This slice owns zero direct-cast damage/save rows with a fixed single
// damageType (every rider/trap/variable-type spell is a documented
// conditional/multi-effect exception, matching Hex/Armor of Agathys/Hunger of
// Hadar's precedent in warlock.ts and the smite spells' precedent in
// paladin.ts) — so, like the Paladin slice, the prose-vs-structured-field
// audit here is almost all exceptions. Every exception's rationale is
// spelled out per-row in ranger.ts's own comments; this describe block is the
// permanent regression guard that the exception set doesn't silently grow or
// shrink out from under those comments.
describe("RANGER_SPELLS_2014 — prose-vs-structured-field audit (catches what dnd5eapi's own JSON gaps hid)", () => {
  const CONDITIONAL_OR_MULTI_EFFECT = new Set([
    "Ensnaring Strike", // rider precondition (next hit) gates a Str save; damage is a RECURRING per-turn tick, not a single instance
    "Hail of Thorns", // rider precondition (next ranged hit) gates the entire Dex-save AoE burst
    "Hunter's Mark", // 1d6 damage is a RIDER on every future weapon attack, not a direct spell-cast damage instance
    "Cordon of Arrows", // a durable trap re-triggering per creature over its whole 8-hour duration, not a single cast-time instance
    "Lightning Arrow", // TWO damage instances (attack-roll-based primary, save-based secondary) — no single instance
    "Conjure Barrage", // damage TYPE is variable ("same as the weapon or ammunition used"), can't be hardcoded into one damageType
    "Conjure Volley", // same variable-damage-type shape as Conjure Barrage
  ]);

  it("every row mentioning 'saving throw' has attackType 'save', unless documented as conditional/multi-effect", () => {
    const bad = RANGER_SPELLS_2014.filter(
      (s) => !CONDITIONAL_OR_MULTI_EFFECT.has(s.name) && /saving throw/i.test(s.description) && s.attackType !== "save",
    ).map((s) => s.name);
    expect(bad, "prose describes a saving throw but attackType isn't 'save'").toEqual([]);
  });

  it("every row mentioning '(melee|ranged) spell attack' has attackType 'attack', unless documented as conditional/multi-effect", () => {
    const bad = RANGER_SPELLS_2014.filter(
      (s) => !CONDITIONAL_OR_MULTI_EFFECT.has(s.name) && /\b(melee|ranged)\s+spell\s+attack/i.test(s.description) && s.attackType !== "attack",
    ).map((s) => s.name);
    expect(bad, "prose describes a spell attack but attackType isn't 'attack'").toEqual([]);
  });

  it("every attackType:'save' row has a saveAbility", () => {
    const bad = RANGER_SPELLS_2014.filter((s) => s.attackType === "save" && !s.saveAbility).map((s) => s.name);
    expect(bad).toEqual([]);
  });

  it("Ensnaring Strike (this slice's only non-exception attackType:'save' row) has saveAbility 'strength'", () => {
    expect(find("Ensnaring Strike").attackType).toBe("save");
    expect(find("Ensnaring Strike").saveAbility).toBe("strength");
  });

  it("every row with an 'XdY <type> damage' phrase in prose has effectKind 'damage', unless documented as conditional/multi-effect", () => {
    const bad = RANGER_SPELLS_2014.filter((s) => {
      if (CONDITIONAL_OR_MULTI_EFFECT.has(s.name)) return false;
      return /\d+d\d+[^.]{0,40}?damage/i.test(s.description) && s.effectKind !== "damage";
    }).map((s) => s.name);
    expect(bad, "prose describes dice damage but effectKind isn't 'damage'").toEqual([]);
  });

  it("every one of this slice's 8 rows is accounted for by either the exception set or a clean pass — no row silently escapes both", () => {
    const exceptionCount = RANGER_SPELLS_2014.filter((s) => CONDITIONAL_OR_MULTI_EFFECT.has(s.name)).length;
    const cleanCount = RANGER_SPELLS_2014.length - exceptionCount;
    // Swift Quiver (pure action-economy utility, no damage/save at all) is
    // this slice's only non-exception row.
    expect(cleanCount).toBe(1);
    expect(exceptionCount).toBe(7);
  });
});

describe("RANGER_SPELLS_2014 — scraping-artifact guards (same shapes spells-2014-shared/wizard/cleric/druid/bard/sorcerer/warlock/paladin-data.test.ts found live)", () => {
  it("no row carries the dnd5eapi 'GM' genericization or its 'o f'/'10d 10' scraping artifacts", () => {
    const bad = RANGER_SPELLS_2014.filter((s) => /\bGM\b/.test(s.description) || /\bo f\b/.test(s.description) || /\d+d \d+/.test(s.description)).map(
      (s) => s.name,
    );
    expect(bad).toEqual([]);
  });

  it("no description repeats a whole word back-to-back (e.g. 'bright light bright light'), or carries a stray 'depending on the model' translation artifact", () => {
    const bad = RANGER_SPELLS_2014.filter((s) => {
      const dupedWordPhrase = /\b(\w+ \w+)\b \1\b/i.test(s.description);
      const translationArtifact = /depending on the model/i.test(s.description);
      return dupedWordPhrase || translationArtifact;
    }).map((s) => s.name);
    expect(bad).toEqual([]);
  });

  it("no description ends a sentence on a bare 'level N.'/'slot N.' (a broken-ordinal artifact)", () => {
    const bad = RANGER_SPELLS_2014.filter((s) => /\b(?:level|slot)s?\s+\d+\.(?:\s|$)/i.test(s.description)).map((s) => s.name);
    expect(bad).toEqual([]);
  });

  it("no description repeats the exact same sentence back to back", () => {
    const bad = RANGER_SPELLS_2014.filter((s) => {
      const sentences = s.description.split(/(?<=[.!?])\s+/).map((sentence) => sentence.trim()).filter(Boolean);
      return sentences.some((sentence, i) => i > 0 && sentence === sentences[i - 1]);
    }).map((s) => s.name);
    expect(bad).toEqual([]);
  });

  it("no description carries a literal markdown pipe table or bold-heading asterisks (SpellDetailCard has no markdown parser)", () => {
    const bad = RANGER_SPELLS_2014.filter((s) => /\|/.test(s.description) || /\*/.test(s.description)).map((s) => s.name);
    expect(bad).toEqual([]);
  });

  it("no description carries a stray quote mark around a bare word (e.g. dnd5eapi's \"within 'range':\")", () => {
    const bad = RANGER_SPELLS_2014.filter((s) => /'[a-zA-Z]+'/.test(s.description)).map((s) => s.name);
    expect(bad).toEqual([]);
  });
});

function find(name: string): CatalogSpell {
  const s = RANGER_SPELLS_2014.find((sp) => sp.name === name);
  if (!s) throw new Error(`RANGER_SPELLS_2014 has no "${name}"`);
  return s;
}

// Spot-checks on every one of this slice's 8 rows — small enough to be
// exhaustive rather than a sample.
describe("RANGER_SPELLS_2014 — value spot-checks", () => {
  it("Ensnaring Strike: ranger-only, non-SRD (PHB'14 p. 237), Str save gates a recurring 1d6 piercing tick while restrained, carries the +1d6-per-upcast-level clause", () => {
    const s = find("Ensnaring Strike");
    expect(s.classes).toEqual(["ranger"]);
    expect(s.level).toBe(1);
    expect(s.concentration).toBe(true);
    expect(s.attackType).toBe("save");
    expect(s.saveAbility).toBe("strength");
    expect(s.effectKind).toBeUndefined();
    expect(s.description).toMatch(/restrained by the magical vines/);
    expect(s.description).toMatch(/1d6 piercing damage at the start of each of its turns/);
    expect(s.description).toMatch(/increases by 1d6 for each slot level above 1st/);
  });

  it("Hail of Thorns: ranger-only, non-SRD (PHB'14 p. 249), rider precondition (next ranged hit) triggers a Dex save-for-half AoE burst, carries the 6d10 upcast cap", () => {
    const s = find("Hail of Thorns");
    expect(s.classes).toEqual(["ranger"]);
    expect(s.level).toBe(1);
    expect(s.concentration).toBe(true);
    expect(s.attackType).toBeUndefined();
    expect(s.effectKind).toBeUndefined();
    expect(s.description).toMatch(/1d10 piercing damage on a failed save, or half as much damage/);
    expect(s.description).toMatch(/to a maximum of 6d10/);
  });

  it("Hunter's Mark: ranger-only (SRD 5.1, not hand-transcribed), rider 1d6 damage on every future weapon attack, remark-on-kill clause, two-tier duration-extension upcast", () => {
    const s = find("Hunter's Mark");
    expect(s.classes).toEqual(["ranger"]);
    expect(s.level).toBe(1);
    expect(s.school).toBe("divination");
    expect(s.range).toBe("90 feet");
    expect(s.concentration).toBe(true);
    expect(s.attackType).toBeUndefined();
    expect(s.effectKind).toBeUndefined();
    expect(s.description).toMatch(/extra 1d6 damage to the target whenever you hit it/);
    expect(s.description).toMatch(/mark a new creature/);
    expect(s.description).toMatch(/maintain your concentration on the spell for up to 8 hours/);
    expect(s.description).toMatch(/up to 24 hours/);
    // 2014's damage is untyped "damage," never "Force damage" (the 2024
    // SPELLS row's rewrite) — see this row's own comment in ranger.ts.
    expect(s.description).not.toMatch(/Force damage/);
  });

  it("Cordon of Arrows: ranger-only, non-SRD (PHB'14 p. 228), durable 8-hour trap, Dex save vs 1d6 piercing per trigger, upcast scales ammo count not dice", () => {
    const s = find("Cordon of Arrows");
    expect(s.classes).toEqual(["ranger"]);
    expect(s.level).toBe(2);
    expect(s.duration).toBe("8 hours");
    expect(s.concentration).toBeUndefined();
    expect(s.attackType).toBeUndefined();
    expect(s.effectKind).toBeUndefined();
    expect(s.description).toMatch(/1d6 piercing damage/);
    expect(s.description).toMatch(/amount of ammunition that can be affected increases by two/);
  });

  it("Lightning Arrow: ranger-only, non-SRD (PHB'14 p. 255), rider precondition (next ranged attack) replaces weapon damage with 4d8 lightning PLUS a separate 2d8 lightning Dex-save AoE, carries the both-effects upcast clause", () => {
    const s = find("Lightning Arrow");
    expect(s.classes).toEqual(["ranger"]);
    expect(s.level).toBe(3);
    expect(s.concentration).toBe(true);
    expect(s.attackType).toBeUndefined();
    expect(s.effectKind).toBeUndefined();
    expect(s.description).toMatch(/4d8 lightning damage on a hit, or half as much damage on a miss/);
    expect(s.description).toMatch(/2d8 lightning damage on a failed save, or half as much damage on a successful one/);
    expect(s.description).toMatch(/damage for both effects of the spell increases by 1d8/);
  });

  it("Conjure Barrage: ranger-only, non-SRD (PHB'14 p. 225), instant 60-ft cone, 3d8 variable-type damage, Dex save for half, no upcast text", () => {
    const s = find("Conjure Barrage");
    expect(s.classes).toEqual(["ranger"]);
    expect(s.level).toBe(3);
    expect(s.range).toBe("Self (60-ft cone)");
    expect(s.duration).toBe("Instantaneous");
    expect(s.concentration).toBeUndefined();
    expect(s.effectKind).toBeUndefined();
    expect(s.damageType).toBeUndefined();
    expect(s.description).toMatch(/3d8 damage on a failed save, or half as much damage/);
    expect(s.description).not.toMatch(/At Higher Levels\./);
  });

  it("Conjure Volley: ranger-only, non-SRD (PHB'14 p. 226), instant 40-ft-radius/20-ft-high cylinder, 8d8 variable-type damage, Dex save for half, no upcast text", () => {
    const s = find("Conjure Volley");
    expect(s.classes).toEqual(["ranger"]);
    expect(s.level).toBe(5);
    expect(s.range).toBe("150 feet");
    expect(s.duration).toBe("Instantaneous");
    expect(s.concentration).toBeUndefined();
    expect(s.effectKind).toBeUndefined();
    expect(s.damageType).toBeUndefined();
    expect(s.description).toMatch(/8d8 damage on a failed save, or half as much damage/);
    expect(s.description).not.toMatch(/At Higher Levels\./);
  });

  it("Swift Quiver: ranger-only, non-SRD (PHB'14 p. 279), touch, pure action-economy utility (two extra ranged attacks via bonus action), no damage/save/upcast at all", () => {
    const s = find("Swift Quiver");
    expect(s.classes).toEqual(["ranger"]);
    expect(s.level).toBe(5);
    expect(s.range).toBe("Touch");
    expect(s.concentration).toBe(true);
    expect(s.attackType).toBeUndefined();
    expect(s.effectKind).toBeUndefined();
    expect(s.description).toMatch(/make two attacks with a weapon that uses ammunition from the quiver/);
    expect(s.description).not.toMatch(/At Higher Levels\./);
  });

  it("no PHB'14 2024-only Ranger addition (e.g. Ensnaring Strike's 2024 rewrite framing, or a 2024-exclusive spell) is offered here — this slice authors only genuine 2014 Ranger-owned spells", () => {
    expect(RANGER_SPELLS_2014.find((s) => s.name === "Zephyr Strike")).toBeUndefined();
    expect(RANGER_SPELLS_2014.find((s) => s.name === "Steel Wind Strike")).toBeUndefined();
  });
});
