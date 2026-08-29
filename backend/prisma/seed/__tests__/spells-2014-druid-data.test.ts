import { describe, expect, it } from "vitest";

import type { CatalogSpell } from "../spells.js";
import { DRUID_SPELLS_2014 } from "../spells-2014/druid.js";
import { CLERIC_SPELLS_2014 } from "../spells-2014/cleric.js";
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

describe("DRUID_SPELLS_2014 — row-ownership rule (epic #1517)", () => {
  it("is exactly the 32 rows this slice owns (32 Druid-owned / 108 total PHB'14 Druid spells — the other 76 are Wizard/Cleric-owned or shared; 2 of the 32 — Beast Sense, Grasping Vine — were added by #1721's authoritative-lookup sweep, a gap in this slice's own SRD-only dataset)", () => {
    expect(DRUID_SPELLS_2014.length).toBe(32);
  });

  it("every row sits on 1-2 classes (3+ belongs in shared.ts instead), each lowercase and a real class name", () => {
    const bad = DRUID_SPELLS_2014.filter(
      (s) => s.classes.length < 1 || s.classes.length > 2 || s.classes.some((c) => c !== c.toLowerCase() || !CLASS_ROSTER.has(c)),
    ).map((s) => s.name);
    expect(bad, "rows on 3+ lists (shared.ts's territory), or with an unknown/uppercased class, don't belong in this slice").toEqual([]);
  });

  it("every row includes druid in its own classes (this slice's whole reason to exist)", () => {
    const bad = DRUID_SPELLS_2014.filter((s) => !s.classes.includes("druid")).map((s) => s.name);
    expect(bad).toEqual([]);
  });

  it("druid is always listed FIRST in classes (owner-class convention, matches wizard.ts/cleric.ts's precedent)", () => {
    const bad = DRUID_SPELLS_2014.filter((s) => s.classes[0] !== "druid").map((s) => s.name);
    expect(bad).toEqual([]);
  });

  it("no row here also includes wizard or cleric — a wizard/cleric+druid spell is THEIR territory (higher tie-break priority), not this slice's", () => {
    const bad = DRUID_SPELLS_2014.filter((s) => s.classes.includes("wizard") || s.classes.includes("cleric")).map((s) => s.name);
    expect(bad, "a row on wizard's or cleric's list too must be authored there, membership-only here").toEqual([]);
  });

  it("every row is authored exactly once — no duplicate names within this slice", () => {
    expect(duplicates(DRUID_SPELLS_2014.map((s) => s.name))).toEqual([]);
  });

  it("no row here is ALSO authored in shared.ts, wizard.ts, or cleric.ts — the row-ownership rule forbids re-transcribing a row owned elsewhere", () => {
    const sharedNames = new Set(SHARED_SPELLS_2014.map((s) => s.name));
    const wizardNames = new Set(WIZARD_SPELLS_2014.map((s) => s.name));
    const clericNames = new Set(CLERIC_SPELLS_2014.map((s) => s.name));
    const overlapShared = DRUID_SPELLS_2014.filter((s) => sharedNames.has(s.name)).map((s) => s.name);
    const overlapWizard = DRUID_SPELLS_2014.filter((s) => wizardNames.has(s.name)).map((s) => s.name);
    const overlapCleric = DRUID_SPELLS_2014.filter((s) => clericNames.has(s.name)).map((s) => s.name);
    expect(overlapShared, "a name authored in BOTH druid.ts and shared.ts is a row-ownership violation, not just a duplicate").toEqual([]);
    expect(overlapWizard, "a name authored in BOTH druid.ts and wizard.ts is a row-ownership violation, not just a duplicate").toEqual([]);
    expect(overlapCleric, "a name authored in BOTH druid.ts and cleric.ts is a row-ownership violation, not just a duplicate").toEqual([]);
  });

  it("no row hardcodes its own edition — index.ts's SPELLS_2014 default is the only place that sets it", () => {
    const tagged = DRUID_SPELLS_2014.filter((s) => s.edition !== undefined).map((s) => s.name);
    expect(tagged, "a row-level edition tag here would still work, but none of this slice's rows are edition-specific within 2014").toEqual([]);
  });
});

describe("DRUID_SPELLS_2014 — structured-field invariants (mirrors wizard.ts's #1714 / cleric.ts's #1715 blocks)", () => {
  it("cantripScaling only on cantrips (level 0)", () => {
    const bad = DRUID_SPELLS_2014.filter((s) => s.cantripScaling && s.level !== 0).map((s) => s.name);
    expect(bad, "leveled spell flagged cantripScaling").toEqual([]);
  });

  it("saveEffect implies a save-based attack", () => {
    const bad = DRUID_SPELLS_2014.filter((s) => s.saveEffect && s.attackType !== "save").map((s) => s.name);
    expect(bad, "saveEffect without attackType 'save'").toEqual([]);
  });

  it("saveEffect only appears on a damage row (shared.ts's own convention)", () => {
    const bad = DRUID_SPELLS_2014.filter((s) => s.saveEffect && s.effectKind !== "damage").map((s) => s.name);
    expect(bad, "saveEffect set on a non-damage row").toEqual([]);
  });

  it("upcastDicePerLevel only on leveled spells (level >= 1)", () => {
    const bad = DRUID_SPELLS_2014.filter((s) => s.upcastDicePerLevel != null && s.level < 1).map((s) => s.name);
    expect(bad, "cantrip with upcastDicePerLevel").toEqual([]);
  });

  it("effectKind 'damage'/'heal' rows carry dice; utility rows carry none", () => {
    const bad = DRUID_SPELLS_2014.filter((s) => {
      const hasDice = s.effectDiceCount != null && s.effectDiceFaces != null;
      const isRoll = s.effectKind === "damage" || s.effectKind === "heal";
      return hasDice !== isRoll;
    }).map((s) => s.name);
    expect(bad, "dice fields not matching a damage/heal effectKind").toEqual([]);
  });

  it("damageType appears iff effectKind is 'damage' (this slice has zero caster-chosen-type exceptions)", () => {
    const bad = DRUID_SPELLS_2014.filter((s) => (s.damageType != null) !== (s.effectKind === "damage")).map((s) => s.name);
    expect(bad, "damageType present without effectKind 'damage', or vice versa").toEqual([]);
  });
});

describe("DRUID_SPELLS_2014 — saveEffect matches its own description text (field/text mismatch guard)", () => {
  const HALF_ON_SUCCESS = /half as much damage|half damage|half the damage/i;

  it("saveEffect 'half' rows say so in their own description", () => {
    const bad = DRUID_SPELLS_2014.filter((s) => s.saveEffect === "half" && !HALF_ON_SUCCESS.test(s.description)).map((s) => s.name);
    expect(bad, "saveEffect:'half' but description never says half-on-success").toEqual([]);
  });

  it("save-based damage rows WITHOUT saveEffect:'half' never claim half-on-success in prose", () => {
    const bad = DRUID_SPELLS_2014.filter(
      (s) => s.effectKind === "damage" && s.attackType === "save" && s.saveEffect !== "half" && HALF_ON_SUCCESS.test(s.description),
    ).map((s) => s.name);
    expect(bad, "description claims half-on-success but saveEffect isn't 'half'").toEqual([]);
  });
});

describe("DRUID_SPELLS_2014 — prose-vs-structured-field audit (catches what dnd5eapi's own JSON gaps hid)", () => {
  const CONDITIONAL_OR_MULTI_EFFECT = new Set([
    "Heat Metal", // the fire damage is UNCONDITIONAL; the CON save only gates a separate consequence (dropping the object)
    "Wall of Thorns", // TWO damage instances (piercing on appearance, slashing while moving through) — no single damageType (matches Flame Strike/Meteor Swarm precedent)
    "Storm of Vengeance", // five distinct rounds, each its own save type and damage type — far past a single resolution (matches Meteor Swarm precedent even more strongly than Flame Strike)
    "Spike Growth", // damage scales with DISTANCE MOVED (2d4 per 5 feet), not a single fixed-dice hit gated by an attack or save — no attackType/effectKind combination expresses a per-5-feet-traveled hazard
  ]);

  it("every row mentioning 'saving throw' has attackType 'save', unless documented as conditional/multi-effect", () => {
    const bad = DRUID_SPELLS_2014.filter(
      (s) => !CONDITIONAL_OR_MULTI_EFFECT.has(s.name) && /saving throw/i.test(s.description) && s.attackType !== "save",
    ).map((s) => s.name);
    expect(bad, "prose describes a saving throw but attackType isn't 'save'").toEqual([]);
  });

  it("every row mentioning '(melee|ranged) spell attack' has attackType 'attack', unless documented as conditional/multi-effect", () => {
    const bad = DRUID_SPELLS_2014.filter(
      (s) => !CONDITIONAL_OR_MULTI_EFFECT.has(s.name) && /\b(melee|ranged)\s+spell\s+attack/i.test(s.description) && s.attackType !== "attack",
    ).map((s) => s.name);
    expect(bad, "prose describes a spell attack but attackType isn't 'attack'").toEqual([]);
  });

  it("every attackType:'save' row has a saveAbility", () => {
    const bad = DRUID_SPELLS_2014.filter((s) => s.attackType === "save" && !s.saveAbility).map((s) => s.name);
    expect(bad).toEqual([]);
  });

  it("every row with an 'XdY <type> damage' phrase in prose has effectKind 'damage', unless documented as conditional/multi-effect", () => {
    const bad = DRUID_SPELLS_2014.filter((s) => {
      if (CONDITIONAL_OR_MULTI_EFFECT.has(s.name)) return false;
      return /\d+d\d+[^.]{0,40}?damage/i.test(s.description) && s.effectKind !== "damage";
    }).map((s) => s.name);
    expect(bad, "prose describes dice damage but effectKind isn't 'damage'").toEqual([]);
  });
});

describe("DRUID_SPELLS_2014 — scraping-artifact guards (same shapes spells-2014-shared/wizard/cleric-data.test.ts found live)", () => {
  it("no row carries the dnd5eapi 'GM' genericization or its 'o f'/'10d 10' scraping artifacts", () => {
    const bad = DRUID_SPELLS_2014.filter((s) => /\bGM\b/.test(s.description) || /\bo f\b/.test(s.description) || /\d+d \d+/.test(s.description)).map(
      (s) => s.name,
    );
    expect(bad).toEqual([]);
  });

  it("no description repeats a whole word back-to-back (e.g. 'bright light bright light'), or carries a stray 'depending on the model' translation artifact", () => {
    const bad = DRUID_SPELLS_2014.filter((s) => {
      const dupedWordPhrase = /\b(\w+ \w+)\b \1\b/i.test(s.description);
      const translationArtifact = /depending on the model/i.test(s.description);
      return dupedWordPhrase || translationArtifact;
    }).map((s) => s.name);
    expect(bad).toEqual([]);
  });

  it("no description ends a sentence on a bare 'level N.'/'slot N.' (a broken-ordinal artifact)", () => {
    const bad = DRUID_SPELLS_2014.filter((s) => /\b(?:level|slot)s?\s+\d+\.(?:\s|$)/i.test(s.description)).map((s) => s.name);
    expect(bad).toEqual([]);
  });

  it("no description repeats the exact same sentence back to back", () => {
    const bad = DRUID_SPELLS_2014.filter((s) => {
      const sentences = s.description.split(/(?<=[.!?])\s+/).map((sentence) => sentence.trim()).filter(Boolean);
      return sentences.some((sentence, i) => i > 0 && sentence === sentences[i - 1]);
    }).map((s) => s.name);
    expect(bad).toEqual([]);
  });

  it("no description carries a literal markdown pipe table or bold-heading asterisks (SpellDetailCard has no markdown parser)", () => {
    const bad = DRUID_SPELLS_2014.filter((s) => /\|/.test(s.description) || /\*/.test(s.description)).map((s) => s.name);
    expect(bad).toEqual([]);
  });

  it("no description carries a stray quote mark around a bare word (e.g. dnd5eapi's \"within 'range':\")", () => {
    const bad = DRUID_SPELLS_2014.filter((s) => /'[a-zA-Z]+'/.test(s.description)).map((s) => s.name);
    expect(bad).toEqual([]);
  });
});

describe("DRUID_SPELLS_2014 — no dropped 'At Higher Levels' tail text (dnd5eapi JSON-vs-real-SRD-text gap, #1746)", () => {
  const HAS_AT_HIGHER_LEVELS_TEXT = new Set([
    "Flame Blade",
    "Heat Metal",
    "Moonbeam",
    "Call Lightning",
    "Conjure Animals",
    "Conjure Woodland Beings",
    "Dominate Beast",
    "Conjure Fey",
    "Wall of Thorns",
  ]);

  it("every row verified to have real SRD 'At Higher Levels' text actually carries it in its description", () => {
    const missing = [...HAS_AT_HIGHER_LEVELS_TEXT].filter((name) => !/At Higher Levels\./.test(find(name).description));
    expect(missing, "a row with verified upcast text is missing its 'At Higher Levels' sentence").toEqual([]);
  });

  it("no OTHER row in this slice claims 'At Higher Levels' text it wasn't verified to have (catches an accidental copy-paste in the other direction)", () => {
    const unexpected = DRUID_SPELLS_2014.filter(
      (s) => !HAS_AT_HIGHER_LEVELS_TEXT.has(s.name) && /At Higher Levels\./.test(s.description),
    ).map((s) => s.name);
    expect(unexpected).toEqual([]);
  });
});

function find(name: string): CatalogSpell {
  const s = DRUID_SPELLS_2014.find((sp) => sp.name === name);
  if (!s) throw new Error(`DRUID_SPELLS_2014 has no "${name}"`);
  return s;
}

describe("DRUID_SPELLS_2014 — value spot-checks", () => {
  it("Call Lightning: DEX save, half on success, 3d10 lightning + upcast — dnd5eapi's own dc field was null despite the prose", () => {
    const s = find("Call Lightning");
    expect(s.classes).toEqual(["druid"]);
    expect(s.attackType).toBe("save");
    expect(s.saveAbility).toBe("dexterity");
    expect(s.saveEffect).toBe("half");
    expect(s.effectKind).toBe("damage");
    expect(s.effectDiceCount).toBe(3);
    expect(s.effectDiceFaces).toBe(10);
    expect(s.damageType).toBe("lightning");
    expect(s.upcastDicePerLevel).toBe(1);
  });

  it("Heat Metal: unconditional 2d8 fire damage + upcast — the CON save only gates dropping the object, not the damage, so attackType/saveAbility are unset", () => {
    const s = find("Heat Metal");
    expect(s.attackType).toBeUndefined();
    expect(s.saveAbility).toBeUndefined();
    expect(s.effectKind).toBe("damage");
    expect(s.effectDiceCount).toBe(2);
    expect(s.effectDiceFaces).toBe(8);
    expect(s.damageType).toBe("fire");
    expect(s.upcastDicePerLevel).toBe(1);
  });

  it("Flame Blade: melee spell attack, 3d6 fire — upcastDicePerLevel deliberately UNSET (PHB'14's real rate is every TWO slot levels, not one)", () => {
    const s = find("Flame Blade");
    expect(s.attackType).toBe("attack");
    expect(s.effectKind).toBe("damage");
    expect(s.effectDiceCount).toBe(3);
    expect(s.effectDiceFaces).toBe(6);
    expect(s.damageType).toBe("fire");
    expect(s.upcastDicePerLevel).toBeUndefined();
    expect(s.description).toMatch(/every two slot levels above 2nd/);
  });

  it("Barkskin: floor 16 AC, concentration required, 1 action to cast — genuinely different from the 2024 SPELLS row (floor 17, non-concentration, bonus action)", () => {
    const s = find("Barkskin");
    expect(s.concentration).toBe(true);
    expect(s.castingTime).toBe("1 action");
    expect(s.effectKind).toBe("buff");
    expect(s.buffTarget).toBe("acFloor");
    expect(s.buffModifier).toBe(16);
  });

  it("Wall of Thorns: TWO damage instances (piercing + slashing) can't fit one damageType, so it stays a utility row (matches Flame Strike/Meteor Swarm precedent)", () => {
    const s = find("Wall of Thorns");
    expect(s.effectKind).toBeUndefined();
    expect(s.attackType).toBeUndefined();
    expect(s.description).toMatch(/7d8 piercing damage/);
    expect(s.description).toMatch(/7d8 slashing damage/);
  });

  it("Storm of Vengeance: five distinct rounds each with their own save/damage type, so it stays a utility row (matches Meteor Swarm precedent)", () => {
    const s = find("Storm of Vengeance");
    expect(s.effectKind).toBeUndefined();
    expect(s.attackType).toBeUndefined();
    expect(s.description).toMatch(/2d6 thunder damage/);
    expect(s.description).toMatch(/10d6 lightning damage/);
    expect(s.description).not.toMatch(/\*/);
  });

  it("Goodberry, Divination, Antilife Shell, Beast Sense: no attack/save/damage shape at all (utility rows)", () => {
    for (const name of ["Goodberry", "Divination", "Antilife Shell", "Beast Sense"]) {
      const s = find(name);
      expect(s.attackType, `${name} should have no attackType`).toBeUndefined();
      expect(s.effectKind, `${name} should have no effectKind`).toBeUndefined();
    }
  });

  it("Beast Sense: added by #1721's authoritative-lookup sweep (not in dnd5eapi's SRD dataset), Druid+Ranger 2-list, ritual, touch, somatic-only", () => {
    const s = find("Beast Sense");
    expect(s.classes).toEqual(["druid", "ranger"]);
    expect(s.level).toBe(2);
    expect(s.ritual).toBe(true);
    expect(s.range).toBe("Touch");
    expect(s.components).toEqual({ verbal: false, somatic: true, material: false });
  });

  it("Grasping Vine: added by #1721's authoritative-lookup sweep (not in dnd5eapi's SRD dataset), Druid+Ranger 2-list, Dex save pulls the target, no damage/upcast", () => {
    const s = find("Grasping Vine");
    expect(s.classes).toEqual(["druid", "ranger"]);
    expect(s.level).toBe(4);
    expect(s.attackType).toBe("save");
    expect(s.saveAbility).toBe("dexterity");
    expect(s.effectKind).toBeUndefined();
    expect(s.description).toMatch(/pulled 20 feet directly toward the vine/);
    expect(s.description).not.toMatch(/At Higher Levels\./);
  });

  it("Druidcraft's stray dnd5eapi quote-mark artifact is cleaned and the odor/order typo is corrected", () => {
    const s = find("Druidcraft");
    expect(s.description).toMatch(/within range:/);
    expect(s.description).toMatch(/faint odor of skunk/);
  });

  it("Reincarnate's d100 race table is prose, not a markdown pipe table, and keeps every original value", () => {
    const s = find("Reincarnate");
    expect(s.description).not.toMatch(/\|/);
    expect(s.description).toMatch(/01-04 Dragonborn/);
    expect(s.description).toMatch(/97-00 Tiefling/);
  });

  it("Conjure Animals' higher-level clause has its dropped trailing word restored ('7th-level slot', not a bare '7th-level.')", () => {
    const s = find("Conjure Animals");
    expect(s.description).toMatch(/three times as many with a 7th-level slot/);
  });

  it("Heat Metal and Awaken are 2-list (Bard + Druid) — authored here (Druid outranks Bard in the tie-break), not Bard's territory", () => {
    expect(find("Heat Metal").classes).toEqual(["druid", "bard"]);
    expect(find("Awaken").classes).toEqual(["druid", "bard"]);
  });

  it("Dominate Beast is 2-list (Sorcerer + Druid) — authored here (Druid outranks Sorcerer), not Sorcerer's territory", () => {
    expect(find("Dominate Beast").classes).toEqual(["druid", "sorcerer"]);
  });

  it("Conjure Fey is 2-list (Warlock + Druid) — authored here (Druid outranks Warlock), not Warlock's territory", () => {
    expect(find("Conjure Fey").classes).toEqual(["druid", "warlock"]);
  });
});
