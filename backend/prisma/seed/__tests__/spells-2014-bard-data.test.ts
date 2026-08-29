import { describe, expect, it } from "vitest";

import type { CatalogSpell } from "../spells.js";
import { BARD_SPELLS_2014 } from "../spells-2014/bard.js";
import { WIZARD_SPELLS_2014 } from "../spells-2014/wizard.js";
import { CLERIC_SPELLS_2014 } from "../spells-2014/cleric.js";
import { DRUID_SPELLS_2014 } from "../spells-2014/druid.js";
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

describe("BARD_SPELLS_2014 — row-ownership rule (epic #1517)", () => {
  it("is exactly the 5 rows this slice owns (5 Bard-owned / 111 total PHB'14 Bard spells — the other 106 are Wizard/Cleric/Druid-owned or shared)", () => {
    expect(BARD_SPELLS_2014.length).toBe(5);
  });

  it("every row sits on 1-2 classes (3+ belongs in shared.ts instead), each lowercase and a real class name", () => {
    const bad = BARD_SPELLS_2014.filter(
      (s) => s.classes.length < 1 || s.classes.length > 2 || s.classes.some((c) => c !== c.toLowerCase() || !CLASS_ROSTER.has(c)),
    ).map((s) => s.name);
    expect(bad, "rows on 3+ lists (shared.ts's territory), or with an unknown/uppercased class, don't belong in this slice").toEqual([]);
  });

  it("every row includes bard in its own classes (this slice's whole reason to exist)", () => {
    const bad = BARD_SPELLS_2014.filter((s) => !s.classes.includes("bard")).map((s) => s.name);
    expect(bad).toEqual([]);
  });

  it("bard is always listed FIRST in classes (owner-class convention, matches wizard.ts/cleric.ts/druid.ts's precedent)", () => {
    const bad = BARD_SPELLS_2014.filter((s) => s.classes[0] !== "bard").map((s) => s.name);
    expect(bad).toEqual([]);
  });

  it("no row here also includes wizard, cleric, or druid — a wizard/cleric/druid+bard spell is THEIR territory (higher tie-break priority), not this slice's", () => {
    const bad = BARD_SPELLS_2014.filter((s) => s.classes.includes("wizard") || s.classes.includes("cleric") || s.classes.includes("druid")).map(
      (s) => s.name,
    );
    expect(bad, "a row on wizard's, cleric's, or druid's list too must be authored there, membership-only here").toEqual([]);
  });

  it("every row is authored exactly once — no duplicate names within this slice", () => {
    expect(duplicates(BARD_SPELLS_2014.map((s) => s.name))).toEqual([]);
  });

  it("no row here is ALSO authored in shared.ts, wizard.ts, cleric.ts, or druid.ts — the row-ownership rule forbids re-transcribing a row owned elsewhere", () => {
    const sharedNames = new Set(SHARED_SPELLS_2014.map((s) => s.name));
    const wizardNames = new Set(WIZARD_SPELLS_2014.map((s) => s.name));
    const clericNames = new Set(CLERIC_SPELLS_2014.map((s) => s.name));
    const druidNames = new Set(DRUID_SPELLS_2014.map((s) => s.name));
    const overlapShared = BARD_SPELLS_2014.filter((s) => sharedNames.has(s.name)).map((s) => s.name);
    const overlapWizard = BARD_SPELLS_2014.filter((s) => wizardNames.has(s.name)).map((s) => s.name);
    const overlapCleric = BARD_SPELLS_2014.filter((s) => clericNames.has(s.name)).map((s) => s.name);
    const overlapDruid = BARD_SPELLS_2014.filter((s) => druidNames.has(s.name)).map((s) => s.name);
    expect(overlapShared, "a name authored in BOTH bard.ts and shared.ts is a row-ownership violation, not just a duplicate").toEqual([]);
    expect(overlapWizard, "a name authored in BOTH bard.ts and wizard.ts is a row-ownership violation, not just a duplicate").toEqual([]);
    expect(overlapCleric, "a name authored in BOTH bard.ts and cleric.ts is a row-ownership violation, not just a duplicate").toEqual([]);
    expect(overlapDruid, "a name authored in BOTH bard.ts and druid.ts is a row-ownership violation, not just a duplicate").toEqual([]);
  });

  it("no row hardcodes its own edition — index.ts's SPELLS_2014 default is the only place that sets it", () => {
    const tagged = BARD_SPELLS_2014.filter((s) => s.edition !== undefined).map((s) => s.name);
    expect(tagged, "a row-level edition tag here would still work, but none of this slice's rows are edition-specific within 2014").toEqual([]);
  });
});

describe("BARD_SPELLS_2014 — full PHB'14 Bard membership is complete across all four authoring slices", () => {
  const WIZARD_OWNED_BARD_SPELLS = [
    "Hideous Laughter",
    "Identify",
    "Magic Mouth",
    "Leomund's Tiny Hut",
    "Otto's Irresistible Dance",
    "Programmed Illusion",
    "Mordenkainen's Magnificent Mansion",
    "Mordenkainen's Sword",
    "Project Image",
    "Mind Blank",
    "Mislead",
    "Modify Memory",
    "Guards and Wards",
  ];
  const CLERIC_OWNED_BARD_SPELLS = ["Bane", "Calm Emotions", "Speak with Dead", "Resurrection"];
  const DRUID_OWNED_BARD_SPELLS = ["Heat Metal", "Awaken"];

  it("every Wizard-owned spell Bard also gets already carries bard membership in wizard.ts (membership-only, not re-authored here)", () => {
    const missing = WIZARD_OWNED_BARD_SPELLS.filter((name) => {
      const row = WIZARD_SPELLS_2014.find((s) => s.name === name);
      return !row || !row.classes.includes("bard");
    });
    expect(missing, "a Wizard-owned Bard spell missing its bard membership tag in wizard.ts").toEqual([]);
  });

  it("every Cleric-owned spell Bard also gets already carries bard membership in cleric.ts (membership-only, not re-authored here)", () => {
    const missing = CLERIC_OWNED_BARD_SPELLS.filter((name) => {
      const row = CLERIC_SPELLS_2014.find((s) => s.name === name);
      return !row || !row.classes.includes("bard");
    });
    expect(missing, "a Cleric-owned Bard spell missing its bard membership tag in cleric.ts").toEqual([]);
  });

  it("every Druid-owned spell Bard also gets already carries bard membership in druid.ts (membership-only, not re-authored here)", () => {
    const missing = DRUID_OWNED_BARD_SPELLS.filter((name) => {
      const row = DRUID_SPELLS_2014.find((s) => s.name === name);
      return !row || !row.classes.includes("bard");
    });
    expect(missing, "a Druid-owned Bard spell missing its bard membership tag in druid.ts").toEqual([]);
  });

  it("SHARED_SPELLS_2014's bard-tagged row count plus the three owner slices' bard-tagged counts plus this slice's own 5 rows equals the full 117-spell PHB'14 Bard list", () => {
    const sharedBardCount = SHARED_SPELLS_2014.filter((s) => s.classes.includes("bard")).length;
    const total =
      sharedBardCount +
      WIZARD_OWNED_BARD_SPELLS.length +
      CLERIC_OWNED_BARD_SPELLS.length +
      DRUID_OWNED_BARD_SPELLS.length +
      BARD_SPELLS_2014.length;
    expect(total).toBe(117);
  });
});

describe("BARD_SPELLS_2014 — structured-field invariants (mirrors wizard.ts/cleric.ts/druid.ts's own blocks)", () => {
  it("cantripScaling only on cantrips (level 0)", () => {
    const bad = BARD_SPELLS_2014.filter((s) => s.cantripScaling && s.level !== 0).map((s) => s.name);
    expect(bad, "leveled spell flagged cantripScaling").toEqual([]);
  });

  it("saveEffect implies a save-based attack", () => {
    const bad = BARD_SPELLS_2014.filter((s) => s.saveEffect && s.attackType !== "save").map((s) => s.name);
    expect(bad, "saveEffect without attackType 'save'").toEqual([]);
  });

  it("saveEffect only appears on a damage row (shared.ts's own convention)", () => {
    const bad = BARD_SPELLS_2014.filter((s) => s.saveEffect && s.effectKind !== "damage").map((s) => s.name);
    expect(bad, "saveEffect set on a non-damage row").toEqual([]);
  });

  it("upcastDicePerLevel only on leveled spells (level >= 1)", () => {
    const bad = BARD_SPELLS_2014.filter((s) => s.upcastDicePerLevel != null && s.level < 1).map((s) => s.name);
    expect(bad, "cantrip with upcastDicePerLevel").toEqual([]);
  });

  it("effectKind 'damage'/'heal' rows carry dice; utility rows carry none", () => {
    const bad = BARD_SPELLS_2014.filter((s) => {
      const hasDice = s.effectDiceCount != null && s.effectDiceFaces != null;
      const isRoll = s.effectKind === "damage" || s.effectKind === "heal";
      return hasDice !== isRoll;
    }).map((s) => s.name);
    expect(bad, "dice fields not matching a damage/heal effectKind").toEqual([]);
  });

  it("damageType appears iff effectKind is 'damage' (this slice has zero caster-chosen-type exceptions)", () => {
    const bad = BARD_SPELLS_2014.filter((s) => (s.damageType != null) !== (s.effectKind === "damage")).map((s) => s.name);
    expect(bad, "damageType present without effectKind 'damage', or vice versa").toEqual([]);
  });
});

describe("BARD_SPELLS_2014 — saveEffect matches its own description text (field/text mismatch guard)", () => {
  const HALF_ON_SUCCESS = /half as much damage|half damage|half the damage/i;

  it("saveEffect 'half' rows say so in their own description", () => {
    const bad = BARD_SPELLS_2014.filter((s) => s.saveEffect === "half" && !HALF_ON_SUCCESS.test(s.description)).map((s) => s.name);
    expect(bad, "saveEffect:'half' but description never says half-on-success").toEqual([]);
  });

  it("save-based damage rows WITHOUT saveEffect:'half' never claim half-on-success in prose", () => {
    const bad = BARD_SPELLS_2014.filter(
      (s) => s.effectKind === "damage" && s.attackType === "save" && s.saveEffect !== "half" && HALF_ON_SUCCESS.test(s.description),
    ).map((s) => s.name);
    expect(bad, "description claims half-on-success but saveEffect isn't 'half'").toEqual([]);
  });
});

describe("BARD_SPELLS_2014 — prose-vs-structured-field audit (catches what dnd5eapi's own JSON gaps hid)", () => {
  // Empty on purpose — keeps the same documented-allowlist shape as wizard.ts/cleric.ts/druid.ts's own audits.
  const CONDITIONAL_OR_MULTI_EFFECT = new Set<string>([]);

  it("every row mentioning 'saving throw' has attackType 'save', unless documented as conditional/multi-effect", () => {
    const bad = BARD_SPELLS_2014.filter(
      (s) => !CONDITIONAL_OR_MULTI_EFFECT.has(s.name) && /saving throw/i.test(s.description) && s.attackType !== "save",
    ).map((s) => s.name);
    expect(bad, "prose describes a saving throw but attackType isn't 'save'").toEqual([]);
  });

  it("every row mentioning '(melee|ranged) spell attack' has attackType 'attack', unless documented as conditional/multi-effect", () => {
    const bad = BARD_SPELLS_2014.filter(
      (s) => !CONDITIONAL_OR_MULTI_EFFECT.has(s.name) && /\b(melee|ranged)\s+spell\s+attack/i.test(s.description) && s.attackType !== "attack",
    ).map((s) => s.name);
    expect(bad, "prose describes a spell attack but attackType isn't 'attack'").toEqual([]);
  });

  it("every attackType:'save' row has a saveAbility", () => {
    const bad = BARD_SPELLS_2014.filter((s) => s.attackType === "save" && !s.saveAbility).map((s) => s.name);
    expect(bad).toEqual([]);
  });

  it("every row with an 'XdY <type> damage' phrase in prose has effectKind 'damage', unless documented as conditional/multi-effect", () => {
    const bad = BARD_SPELLS_2014.filter((s) => {
      if (CONDITIONAL_OR_MULTI_EFFECT.has(s.name)) return false;
      return /\d+d\d+[^.]{0,40}?damage/i.test(s.description) && s.effectKind !== "damage";
    }).map((s) => s.name);
    expect(bad, "prose describes dice damage but effectKind isn't 'damage'").toEqual([]);
  });
});

describe("BARD_SPELLS_2014 — no dropped 'At Higher Levels' tail text (dnd5eapi JSON-vs-real-SRD-text gap, PR #1745 review finding)", () => {
  // Only Heroism has real "At Higher Levels" text among this slice's 5 rows (verified against 5thsrd.org) — keep in sync with future edits.
  const HAS_AT_HIGHER_LEVELS_TEXT = new Set(["Heroism"]);

  it("every row verified to have real SRD 'At Higher Levels' text actually carries it in its description", () => {
    const missing = [...HAS_AT_HIGHER_LEVELS_TEXT].filter((name) => !/At Higher Levels\./.test(find(name).description));
    expect(missing, "a row with verified upcast text is missing its 'At Higher Levels' sentence").toEqual([]);
  });

  it("no OTHER row in this slice claims 'At Higher Levels' text it wasn't verified to have (catches an accidental copy-paste in the other direction)", () => {
    const unexpected = BARD_SPELLS_2014.filter(
      (s) => !HAS_AT_HIGHER_LEVELS_TEXT.has(s.name) && /At Higher Levels\./.test(s.description),
    ).map((s) => s.name);
    expect(unexpected).toEqual([]);
  });
});

describe("BARD_SPELLS_2014 — scraping-artifact guards (same shapes spells-2014-shared/wizard/cleric/druid-data.test.ts found live)", () => {
  it("no row carries the dnd5eapi 'GM' genericization or its 'o f'/'10d 10' scraping artifacts", () => {
    const bad = BARD_SPELLS_2014.filter((s) => /\bGM\b/.test(s.description) || /\bo f\b/.test(s.description) || /\d+d \d+/.test(s.description)).map(
      (s) => s.name,
    );
    expect(bad).toEqual([]);
  });

  it("no description repeats a whole word back-to-back (e.g. 'bright light bright light'), or carries a stray 'depending on the model' translation artifact", () => {
    const bad = BARD_SPELLS_2014.filter((s) => {
      const dupedWordPhrase = /\b(\w+ \w+)\b \1\b/i.test(s.description);
      const translationArtifact = /depending on the model/i.test(s.description);
      return dupedWordPhrase || translationArtifact;
    }).map((s) => s.name);
    expect(bad).toEqual([]);
  });

  it("no description ends a sentence on a bare 'level N.'/'slot N.' (a broken-ordinal artifact)", () => {
    const bad = BARD_SPELLS_2014.filter((s) => /\b(?:level|slot)s?\s+\d+\.(?:\s|$)/i.test(s.description)).map((s) => s.name);
    expect(bad).toEqual([]);
  });

  it("no description repeats the exact same sentence back to back", () => {
    const bad = BARD_SPELLS_2014.filter((s) => {
      const sentences = s.description.split(/(?<=[.!?])\s+/).map((sentence) => sentence.trim()).filter(Boolean);
      return sentences.some((sentence, i) => i > 0 && sentence === sentences[i - 1]);
    }).map((s) => s.name);
    expect(bad).toEqual([]);
  });

  it("no description carries a literal markdown pipe table or bold-heading asterisks (SpellDetailCard has no markdown parser)", () => {
    const bad = BARD_SPELLS_2014.filter((s) => /\|/.test(s.description) || /\*/.test(s.description)).map((s) => s.name);
    expect(bad).toEqual([]);
  });

  it("no description carries a stray quote mark around a bare word (e.g. dnd5eapi's \"within 'range':\")", () => {
    const bad = BARD_SPELLS_2014.filter((s) => /'[a-zA-Z]+'/.test(s.description)).map((s) => s.name);
    expect(bad).toEqual([]);
  });
});

function find(name: string): CatalogSpell {
  const s = BARD_SPELLS_2014.find((sp) => sp.name === name);
  if (!s) throw new Error(`BARD_SPELLS_2014 has no "${name}"`);
  return s;
}

describe("BARD_SPELLS_2014 — value spot-checks", () => {
  it("Vicious Mockery: WIS save, no half-on-fail, 1d4 psychic + cantrip scaling — the only owned row with a damage shape", () => {
    const s = find("Vicious Mockery");
    expect(s.classes).toEqual(["bard"]);
    expect(s.level).toBe(0);
    expect(s.attackType).toBe("save");
    expect(s.saveAbility).toBe("wisdom");
    expect(s.saveEffect).toBe("none");
    expect(s.effectKind).toBe("damage");
    expect(s.effectDiceCount).toBe(1);
    expect(s.effectDiceFaces).toBe(4);
    expect(s.damageType).toBe("psychic");
    expect(s.cantripScaling).toBe(true);
  });

  it("Heroism: 2-list (Bard + Paladin) — authored here (Bard outranks Paladin in the tie-break), not Paladin's territory; no attack/save/effectKind (temp-HP-per-turn is inexpressible as a dice heal); carries its 'At Higher Levels' clause (dnd5eapi's own JSON dropped this — see PR #1745 review finding, hand-restored from a second source)", () => {
    const s = find("Heroism");
    expect(s.classes).toEqual(["bard", "paladin"]);
    expect(s.level).toBe(1);
    expect(s.concentration).toBe(true);
    expect(s.attackType).toBeUndefined();
    expect(s.effectKind).toBeUndefined();
    expect(s.description).toMatch(/At Higher Levels\. When you cast this spell using a spell slot of 2nd level or higher, you can target one additional creature for each slot level above 1st\./);
  });

  it("Enthrall: 2-list (Bard + Warlock) — authored here (Bard outranks Warlock); WIS save gates a Perception-check penalty, no effectKind", () => {
    const s = find("Enthrall");
    expect(s.classes).toEqual(["bard", "warlock"]);
    expect(s.level).toBe(2);
    expect(s.attackType).toBe("save");
    expect(s.saveAbility).toBe("wisdom");
    expect(s.effectKind).toBeUndefined();
  });

  it("Compulsion: bard-only, WIS save gates forced movement, no effectKind", () => {
    const s = find("Compulsion");
    expect(s.classes).toEqual(["bard"]);
    expect(s.level).toBe(4);
    expect(s.concentration).toBe(true);
    expect(s.attackType).toBe("save");
    expect(s.saveAbility).toBe("wisdom");
    expect(s.effectKind).toBeUndefined();
  });

  it("Glibness: 2-list (Bard + Warlock) — authored here (Bard outranks Warlock); check-replacement + truth immunity, no attack/save/effectKind at all", () => {
    const s = find("Glibness");
    expect(s.classes).toEqual(["bard", "warlock"]);
    expect(s.level).toBe(8);
    expect(s.attackType).toBeUndefined();
    expect(s.effectKind).toBeUndefined();
    expect(s.saveAbility).toBeUndefined();
  });

  it("no PHB'14 2024-only Bard addition (e.g. Command, Tasha's Hideous Laughter under Bard) is offered here — this slice authors only genuine 2014 Bard-owned spells", () => {
    // Command is Cleric/Paladin-only in the 2014 SRD — never Bard.
    expect(BARD_SPELLS_2014.find((s) => s.name === "Command")).toBeUndefined();
  });
});
