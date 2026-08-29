import { describe, expect, it } from "vitest";

import type { CatalogSpell } from "../spells.js";
import { WARLOCK_SPELLS_2014 } from "../spells-2014/warlock.js";
import { WIZARD_SPELLS_2014 } from "../spells-2014/wizard.js";
import { DRUID_SPELLS_2014 } from "../spells-2014/druid.js";
import { BARD_SPELLS_2014 } from "../spells-2014/bard.js";
import { CLERIC_SPELLS_2014 } from "../spells-2014/cleric.js";
import { SORCERER_SPELLS_2014 } from "../spells-2014/sorcerer.js";
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

describe("WARLOCK_SPELLS_2014 — row-ownership rule (epic #1517)", () => {
  it("is exactly the 6 rows this slice owns (6 Warlock-owned / 72 total PHB'14 Warlock spells — the other 66 are Wizard/Druid/Bard-owned or shared)", () => {
    expect(WARLOCK_SPELLS_2014.length).toBe(6);
  });

  it("every row sits on exactly 1 class (warlock) — a 2-list Warlock spell would still be owned here only if warlock is the highest-priority class present, but none of this slice's 6 owned rows are shared with another class", () => {
    const bad = WARLOCK_SPELLS_2014.filter(
      (s) => s.classes.length !== 1 || s.classes.some((c) => c !== c.toLowerCase() || !CLASS_ROSTER.has(c)),
    ).map((s) => s.name);
    expect(bad, "rows on 2+ lists, or with an unknown/uppercased class, need individual review against the tie-break").toEqual([]);
  });

  it("every row includes warlock in its own classes (this slice's whole reason to exist)", () => {
    const bad = WARLOCK_SPELLS_2014.filter((s) => !s.classes.includes("warlock")).map((s) => s.name);
    expect(bad).toEqual([]);
  });

  it("no row here also includes wizard, cleric, druid, bard, or sorcerer — such a spell is THEIR territory (higher tie-break priority), not this slice's", () => {
    const bad = WARLOCK_SPELLS_2014.filter(
      (s) =>
        s.classes.includes("wizard") ||
        s.classes.includes("cleric") ||
        s.classes.includes("druid") ||
        s.classes.includes("bard") ||
        s.classes.includes("sorcerer"),
    ).map((s) => s.name);
    expect(bad, "a row on a higher-priority class's list too must be authored there, membership-only here").toEqual([]);
  });

  it("every row is authored exactly once — no duplicate names within this slice", () => {
    expect(duplicates(WARLOCK_SPELLS_2014.map((s) => s.name))).toEqual([]);
  });

  it("no row here is ALSO authored in shared.ts, wizard.ts, cleric.ts, druid.ts, bard.ts, or sorcerer.ts — the row-ownership rule forbids re-transcribing a row owned elsewhere", () => {
    const sharedNames = new Set(SHARED_SPELLS_2014.map((s) => s.name));
    const wizardNames = new Set(WIZARD_SPELLS_2014.map((s) => s.name));
    const clericNames = new Set(CLERIC_SPELLS_2014.map((s) => s.name));
    const druidNames = new Set(DRUID_SPELLS_2014.map((s) => s.name));
    const bardNames = new Set(BARD_SPELLS_2014.map((s) => s.name));
    const sorcererNames = new Set(SORCERER_SPELLS_2014.map((s) => s.name));
    const overlaps: Record<string, string[]> = {
      shared: WARLOCK_SPELLS_2014.filter((s) => sharedNames.has(s.name)).map((s) => s.name),
      wizard: WARLOCK_SPELLS_2014.filter((s) => wizardNames.has(s.name)).map((s) => s.name),
      cleric: WARLOCK_SPELLS_2014.filter((s) => clericNames.has(s.name)).map((s) => s.name),
      druid: WARLOCK_SPELLS_2014.filter((s) => druidNames.has(s.name)).map((s) => s.name),
      bard: WARLOCK_SPELLS_2014.filter((s) => bardNames.has(s.name)).map((s) => s.name),
      sorcerer: WARLOCK_SPELLS_2014.filter((s) => sorcererNames.has(s.name)).map((s) => s.name),
    };
    for (const [file, names] of Object.entries(overlaps)) {
      expect(names, `a name authored in BOTH warlock.ts and ${file}.ts is a row-ownership violation, not just a duplicate`).toEqual([]);
    }
  });

  it("no row hardcodes its own edition — index.ts's SPELLS_2014 default is the only place that sets it", () => {
    const tagged = WARLOCK_SPELLS_2014.filter((s) => s.edition !== undefined).map((s) => s.name);
    expect(tagged, "a row-level edition tag here would still work, but none of this slice's rows are edition-specific within 2014").toEqual([]);
  });
});

describe("WARLOCK_SPELLS_2014 — full PHB'14 Warlock membership is complete across all authoring slices", () => {
  const WIZARD_OWNED_WARLOCK_SPELLS = [
    "Ray of Enfeeblement",
    "Vampiric Touch",
    "Contact Other Plane",
    "Flesh to Stone",
    "Demiplane",
    "Imprisonment",
  ];
  const DRUID_OWNED_WARLOCK_SPELLS = ["Conjure Fey"];
  const BARD_OWNED_WARLOCK_SPELLS = ["Enthrall", "Glibness"];

  it("every Wizard-owned spell Warlock also gets already carries warlock membership in wizard.ts (membership-only, not re-authored here)", () => {
    const missing = WIZARD_OWNED_WARLOCK_SPELLS.filter((name) => {
      const row = WIZARD_SPELLS_2014.find((s) => s.name === name);
      return !row || !row.classes.includes("warlock");
    });
    expect(missing, "a Wizard-owned Warlock spell missing its warlock membership tag in wizard.ts").toEqual([]);
  });

  it("every Druid-owned spell Warlock also gets already carries warlock membership in druid.ts (membership-only, not re-authored here)", () => {
    const missing = DRUID_OWNED_WARLOCK_SPELLS.filter((name) => {
      const row = DRUID_SPELLS_2014.find((s) => s.name === name);
      return !row || !row.classes.includes("warlock");
    });
    expect(missing, "a Druid-owned Warlock spell missing its warlock membership tag in druid.ts").toEqual([]);
  });

  it("every Bard-owned spell Warlock also gets already carries warlock membership in bard.ts (membership-only, not re-authored here)", () => {
    const missing = BARD_OWNED_WARLOCK_SPELLS.filter((name) => {
      const row = BARD_SPELLS_2014.find((s) => s.name === name);
      return !row || !row.classes.includes("warlock");
    });
    expect(missing, "a Bard-owned Warlock spell missing its warlock membership tag in bard.ts").toEqual([]);
  });

  it("no Cleric-owned or Sorcerer-owned 2-list spell exists that Warlock also gets (Cleric and Sorcerer both outrank Warlock in the tie-break, so any such spell would be their territory, not a gap here) — Cleric carries zero warlock tags, and Sorcerer owns zero rows at all", () => {
    expect(CLERIC_SPELLS_2014.filter((s) => s.classes.includes("warlock")).map((s) => s.name)).toEqual([]);
    expect(SORCERER_SPELLS_2014).toEqual([]);
  });

  it("SHARED_SPELLS_2014's warlock-tagged row count plus the three owner slices' warlock-tagged counts plus this slice's own 6 rows equals the full 74-spell PHB'14 Warlock list", () => {
    const sharedWarlockCount = SHARED_SPELLS_2014.filter((s) => s.classes.includes("warlock")).length;
    const total =
      sharedWarlockCount +
      WIZARD_OWNED_WARLOCK_SPELLS.length +
      DRUID_OWNED_WARLOCK_SPELLS.length +
      BARD_OWNED_WARLOCK_SPELLS.length +
      WARLOCK_SPELLS_2014.length;
    expect(total).toBe(74);
  });

  it("no PHB'14 2024-only Warlock addition (e.g. Command, Booming Blade, Toll the Dead under Warlock) is offered anywhere in the 2014 tables — this slice's membership check only counts genuine 2014 Warlock-owned spells", () => {
    const command = [...WIZARD_SPELLS_2014, ...CLERIC_SPELLS_2014, ...DRUID_SPELLS_2014, ...BARD_SPELLS_2014, ...SHARED_SPELLS_2014].find(
      (s) => s.name === "Command",
    );
    expect(command?.classes.includes("warlock")).not.toBe(true);
  });
});

describe("WARLOCK_SPELLS_2014 — structured-field invariants (mirrors wizard.ts/cleric.ts/druid.ts/bard.ts's own blocks)", () => {
  it("cantripScaling only on cantrips (level 0)", () => {
    const bad = WARLOCK_SPELLS_2014.filter((s) => s.cantripScaling && s.level !== 0).map((s) => s.name);
    expect(bad, "leveled spell flagged cantripScaling").toEqual([]);
  });

  it("saveEffect implies a save-based attack", () => {
    const bad = WARLOCK_SPELLS_2014.filter((s) => s.saveEffect && s.attackType !== "save").map((s) => s.name);
    expect(bad, "saveEffect without attackType 'save'").toEqual([]);
  });

  it("saveEffect only appears on a damage row (shared.ts's own convention)", () => {
    const bad = WARLOCK_SPELLS_2014.filter((s) => s.saveEffect && s.effectKind !== "damage").map((s) => s.name);
    expect(bad, "saveEffect set on a non-damage row").toEqual([]);
  });

  it("upcastDicePerLevel only on leveled spells (level >= 1)", () => {
    const bad = WARLOCK_SPELLS_2014.filter((s) => s.upcastDicePerLevel != null && s.level < 1).map((s) => s.name);
    expect(bad, "cantrip with upcastDicePerLevel").toEqual([]);
  });

  it("effectKind 'damage'/'heal' rows carry dice; utility rows carry none", () => {
    const bad = WARLOCK_SPELLS_2014.filter((s) => {
      const hasDice = s.effectDiceCount != null && s.effectDiceFaces != null;
      const isRoll = s.effectKind === "damage" || s.effectKind === "heal";
      return hasDice !== isRoll;
    }).map((s) => s.name);
    expect(bad, "dice fields not matching a damage/heal effectKind").toEqual([]);
  });

  it("damageType appears iff effectKind is 'damage' (this slice has zero caster-chosen-type exceptions)", () => {
    const bad = WARLOCK_SPELLS_2014.filter((s) => (s.damageType != null) !== (s.effectKind === "damage")).map((s) => s.name);
    expect(bad, "damageType present without effectKind 'damage', or vice versa").toEqual([]);
  });
});

describe("WARLOCK_SPELLS_2014 — saveEffect matches its own description text (field/text mismatch guard)", () => {
  const HALF_ON_SUCCESS = /half as much damage|half damage|half the damage/i;

  it("saveEffect 'half' rows say so in their own description", () => {
    const bad = WARLOCK_SPELLS_2014.filter((s) => s.saveEffect === "half" && !HALF_ON_SUCCESS.test(s.description)).map((s) => s.name);
    expect(bad, "saveEffect:'half' but description never says half-on-success").toEqual([]);
  });

  it("save-based damage rows WITHOUT saveEffect:'half' never claim half-on-success in prose", () => {
    const bad = WARLOCK_SPELLS_2014.filter(
      (s) => s.effectKind === "damage" && s.attackType === "save" && s.saveEffect !== "half" && HALF_ON_SUCCESS.test(s.description),
    ).map((s) => s.name);
    expect(bad, "description claims half-on-success but saveEffect isn't 'half'").toEqual([]);
  });
});

describe("WARLOCK_SPELLS_2014 — prose-vs-structured-field audit (catches what dnd5eapi's own JSON gaps hid)", () => {
  const CONDITIONAL_OR_MULTI_EFFECT = new Set([
    "Hex", // 1d6 necrotic is a RIDER on the caster's own future attacks, not a direct spell-cast damage instance
    "Hunger of Hadar", // 2d6 cold (unconditional) AND 2d6 acid (DEX save) on two different triggers — no single instance
  ]);

  it("every row mentioning 'saving throw' has attackType 'save', unless documented as conditional/multi-effect", () => {
    const bad = WARLOCK_SPELLS_2014.filter(
      (s) => !CONDITIONAL_OR_MULTI_EFFECT.has(s.name) && /saving throw/i.test(s.description) && s.attackType !== "save",
    ).map((s) => s.name);
    expect(bad, "prose describes a saving throw but attackType isn't 'save'").toEqual([]);
  });

  it("every row mentioning '(melee|ranged) spell attack' has attackType 'attack', unless documented as conditional/multi-effect", () => {
    const bad = WARLOCK_SPELLS_2014.filter(
      (s) => !CONDITIONAL_OR_MULTI_EFFECT.has(s.name) && /\b(melee|ranged)\s+spell\s+attack/i.test(s.description) && s.attackType !== "attack",
    ).map((s) => s.name);
    expect(bad, "prose describes a spell attack but attackType isn't 'attack'").toEqual([]);
  });

  it("every attackType:'save' row has a saveAbility", () => {
    const bad = WARLOCK_SPELLS_2014.filter((s) => s.attackType === "save" && !s.saveAbility).map((s) => s.name);
    expect(bad).toEqual([]);
  });

  it("every row with an 'XdY <type> damage' phrase in prose has effectKind 'damage', unless documented as conditional/multi-effect", () => {
    const bad = WARLOCK_SPELLS_2014.filter((s) => {
      if (CONDITIONAL_OR_MULTI_EFFECT.has(s.name)) return false;
      return /\d+d\d+[^.]{0,40}?damage/i.test(s.description) && s.effectKind !== "damage";
    }).map((s) => s.name);
    expect(bad, "prose describes dice damage but effectKind isn't 'damage'").toEqual([]);
  });
});

describe("WARLOCK_SPELLS_2014 — no dropped 'At Higher Levels' tail text (dnd5eapi JSON-vs-real-SRD-text gap, PR #1745 review finding)", () => {
  // Eldritch Blast's scaling is baked into its base description, not an At Higher Levels clause; Hunger of Hadar has no upcast clause in either edition.
  const HAS_AT_HIGHER_LEVELS_TEXT = new Set(["Hellish Rebuke", "Hex", "Armor of Agathys", "Arms of Hadar"]);

  it("every row verified to have real SRD 'At Higher Levels' text actually carries it in its description", () => {
    const missing = [...HAS_AT_HIGHER_LEVELS_TEXT].filter((name) => !/At Higher Levels\./.test(find(name).description));
    expect(missing, "a row with verified upcast text is missing its 'At Higher Levels' sentence").toEqual([]);
  });

  it("no OTHER row in this slice claims 'At Higher Levels' text it wasn't verified to have (catches an accidental copy-paste in the other direction)", () => {
    const unexpected = WARLOCK_SPELLS_2014.filter(
      (s) => !HAS_AT_HIGHER_LEVELS_TEXT.has(s.name) && /At Higher Levels\./.test(s.description),
    ).map((s) => s.name);
    expect(unexpected).toEqual([]);
  });
});

describe("WARLOCK_SPELLS_2014 — scraping-artifact guards (same shapes spells-2014-shared/wizard/cleric/druid/bard-data.test.ts found live)", () => {
  it("no row carries the dnd5eapi 'GM' genericization or its 'o f'/'10d 10' scraping artifacts", () => {
    const bad = WARLOCK_SPELLS_2014.filter((s) => /\bGM\b/.test(s.description) || /\bo f\b/.test(s.description) || /\d+d \d+/.test(s.description)).map(
      (s) => s.name,
    );
    expect(bad).toEqual([]);
  });

  it("no description repeats a whole word back-to-back (e.g. 'bright light bright light'), or carries a stray 'depending on the model' translation artifact", () => {
    const bad = WARLOCK_SPELLS_2014.filter((s) => {
      const dupedWordPhrase = /\b(\w+ \w+)\b \1\b/i.test(s.description);
      const translationArtifact = /depending on the model/i.test(s.description);
      return dupedWordPhrase || translationArtifact;
    }).map((s) => s.name);
    expect(bad).toEqual([]);
  });

  it("no description ends a sentence on a bare 'level N.'/'slot N.' (a broken-ordinal artifact)", () => {
    const bad = WARLOCK_SPELLS_2014.filter((s) => /\b(?:level|slot)s?\s+\d+\.(?:\s|$)/i.test(s.description)).map((s) => s.name);
    expect(bad).toEqual([]);
  });

  it("no description repeats the exact same sentence back to back", () => {
    const bad = WARLOCK_SPELLS_2014.filter((s) => {
      const sentences = s.description.split(/(?<=[.!?])\s+/).map((sentence) => sentence.trim()).filter(Boolean);
      return sentences.some((sentence, i) => i > 0 && sentence === sentences[i - 1]);
    }).map((s) => s.name);
    expect(bad).toEqual([]);
  });

  it("no description carries a literal markdown pipe table or bold-heading asterisks (SpellDetailCard has no markdown parser)", () => {
    const bad = WARLOCK_SPELLS_2014.filter((s) => /\|/.test(s.description) || /\*/.test(s.description)).map((s) => s.name);
    expect(bad).toEqual([]);
  });

  it("no description carries a stray quote mark around a bare word (e.g. dnd5eapi's \"within 'range':\")", () => {
    const bad = WARLOCK_SPELLS_2014.filter((s) => /'[a-zA-Z]+'/.test(s.description)).map((s) => s.name);
    expect(bad).toEqual([]);
  });
});

function find(name: string): CatalogSpell {
  const s = WARLOCK_SPELLS_2014.find((sp) => sp.name === name);
  if (!s) throw new Error(`WARLOCK_SPELLS_2014 has no "${name}"`);
  return s;
}

describe("WARLOCK_SPELLS_2014 — value spot-checks", () => {
  it("Eldritch Blast: warlock-only cantrip, ranged spell attack, 1d10 force, no cantripScaling flag (the beam-count increase is prose, not a dice-scaling field)", () => {
    const s = find("Eldritch Blast");
    expect(s.classes).toEqual(["warlock"]);
    expect(s.level).toBe(0);
    expect(s.attackType).toBe("attack");
    expect(s.effectKind).toBe("damage");
    expect(s.effectDiceCount).toBe(1);
    expect(s.effectDiceFaces).toBe(10);
    expect(s.damageType).toBe("force");
    expect(s.cantripScaling).toBeUndefined();
  });

  it("Hellish Rebuke: warlock-only reaction, DEX save, half on success, 2d10 fire, +1d10 per upcast level", () => {
    const s = find("Hellish Rebuke");
    expect(s.classes).toEqual(["warlock"]);
    expect(s.level).toBe(1);
    expect(s.castingTime).toBe("1 reaction");
    expect(s.attackType).toBe("save");
    expect(s.saveAbility).toBe("dexterity");
    expect(s.saveEffect).toBe("half");
    expect(s.effectKind).toBe("damage");
    expect(s.effectDiceCount).toBe(2);
    expect(s.effectDiceFaces).toBe(10);
    expect(s.damageType).toBe("fire");
    expect(s.upcastDicePerLevel).toBe(1);
  });

  it("Hex: warlock-only, non-SRD (PHB'14 p. 251), bonus-action curse with a per-hit necrotic rider — no attackType/effectKind (matches Hunter's Mark's shape); carries the remove-curse end condition and the 8hr/24hr concentration-extension upcast text", () => {
    const s = find("Hex");
    expect(s.classes).toEqual(["warlock"]);
    expect(s.level).toBe(1);
    expect(s.castingTime).toBe("1 bonus action");
    expect(s.concentration).toBe(true);
    expect(s.attackType).toBeUndefined();
    expect(s.effectKind).toBeUndefined();
    expect(s.components).toEqual({ verbal: true, somatic: true, material: true, materialDescription: "the petrified eye of a newt" });
    expect(s.description).toMatch(/A remove curse cast on the target ends this spell early\./);
    expect(s.description).toMatch(/maintain your concentration on the spell for up to 8 hours/);
    expect(s.description).toMatch(/up to 24 hours/);
  });

  it("Armor of Agathys: warlock-only, non-SRD (PHB'14 p. 215), flat 5 temp HP + flat 5 cold damage rider (no dice at all) — no effectKind (matches False Life/Heroism's temp-HP shape)", () => {
    const s = find("Armor of Agathys");
    expect(s.classes).toEqual(["warlock"]);
    expect(s.level).toBe(1);
    expect(s.range).toBe("Self");
    expect(s.attackType).toBeUndefined();
    expect(s.effectKind).toBeUndefined();
    expect(s.effectDiceCount).toBeUndefined();
    expect(s.components).toEqual({ verbal: true, somatic: true, material: true, materialDescription: "a cup of water" });
    expect(s.description).toMatch(/both the temporary hit points and the cold damage increase by 5 for each slot level above 1st/);
  });

  it("Arms of Hadar: warlock-only, non-SRD (PHB'14 p. 215), STR save, half on success, 2d6 necrotic, +1d6 per upcast level", () => {
    const s = find("Arms of Hadar");
    expect(s.classes).toEqual(["warlock"]);
    expect(s.level).toBe(1);
    expect(s.range).toBe("Self (10-foot radius)");
    expect(s.attackType).toBe("save");
    expect(s.saveAbility).toBe("strength");
    expect(s.saveEffect).toBe("half");
    expect(s.effectKind).toBe("damage");
    expect(s.effectDiceCount).toBe(2);
    expect(s.effectDiceFaces).toBe(6);
    expect(s.damageType).toBe("necrotic");
    expect(s.upcastDicePerLevel).toBe(1);
  });

  it("Hunger of Hadar: warlock-only, non-SRD (PHB'14 p. 251), two fixed damage types on two triggers (2d6 cold unconditional, 2d6 acid on a failed DEX save) — no single effectKind/attackType captures both; no 'At Higher Levels' text in either source", () => {
    const s = find("Hunger of Hadar");
    expect(s.classes).toEqual(["warlock"]);
    expect(s.level).toBe(3);
    expect(s.concentration).toBe(true);
    expect(s.attackType).toBeUndefined();
    expect(s.effectKind).toBeUndefined();
    expect(s.description).toMatch(/takes 2d6 cold damage/);
    expect(s.description).toMatch(/Dexterity saving throw or take 2d6 acid damage/);
    expect(s.description).not.toMatch(/At Higher Levels\./);
  });

  it("no PHB'14 2024-only Warlock addition (e.g. Booming Blade, Green-Flame Blade, Toll the Dead) is offered here — this slice authors only genuine 2014 Warlock-owned spells", () => {
    expect(WARLOCK_SPELLS_2014.find((s) => s.name === "Booming Blade")).toBeUndefined();
    expect(WARLOCK_SPELLS_2014.find((s) => s.name === "Green-Flame Blade")).toBeUndefined();
    expect(WARLOCK_SPELLS_2014.find((s) => s.name === "Toll the Dead")).toBeUndefined();
  });
});
