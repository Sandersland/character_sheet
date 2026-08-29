import { describe, expect, it } from "vitest";

import type { CatalogSpell } from "../spells.js";
import { PALADIN_SPELLS_2014 } from "../spells-2014/paladin.js";
import { WIZARD_SPELLS_2014 } from "../spells-2014/wizard.js";
import { CLERIC_SPELLS_2014 } from "../spells-2014/cleric.js";
import { DRUID_SPELLS_2014 } from "../spells-2014/druid.js";
import { BARD_SPELLS_2014 } from "../spells-2014/bard.js";
import { SORCERER_SPELLS_2014 } from "../spells-2014/sorcerer.js";
import { WARLOCK_SPELLS_2014 } from "../spells-2014/warlock.js";
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

describe("PALADIN_SPELLS_2014 — row-ownership rule (epic #1517)", () => {
  it("is exactly the 16 rows this slice owns (16 Paladin-owned / 44 total PHB'14 Paladin spells — the other 28 are Cleric/Bard/Wizard-owned or shared)", () => {
    expect(PALADIN_SPELLS_2014.length).toBe(16);
  });

  it("every row sits on exactly 1 class (paladin) — a 2-list Paladin spell would still be owned here only if paladin is the highest-priority class present, but none of this slice's 16 owned rows are shared with another class", () => {
    const bad = PALADIN_SPELLS_2014.filter(
      (s) => s.classes.length !== 1 || s.classes.some((c) => c !== c.toLowerCase() || !CLASS_ROSTER.has(c)),
    ).map((s) => s.name);
    expect(bad, "rows on 2+ lists, or with an unknown/uppercased class, need individual review against the tie-break").toEqual([]);
  });

  it("every row includes paladin in its own classes (this slice's whole reason to exist)", () => {
    const bad = PALADIN_SPELLS_2014.filter((s) => !s.classes.includes("paladin")).map((s) => s.name);
    expect(bad).toEqual([]);
  });

  it("no row here also includes wizard, cleric, druid, bard, sorcerer, or warlock — such a spell is THEIR territory (higher tie-break priority), not this slice's", () => {
    const bad = PALADIN_SPELLS_2014.filter(
      (s) =>
        s.classes.includes("wizard") ||
        s.classes.includes("cleric") ||
        s.classes.includes("druid") ||
        s.classes.includes("bard") ||
        s.classes.includes("sorcerer") ||
        s.classes.includes("warlock"),
    ).map((s) => s.name);
    expect(bad, "a row on a higher-priority class's list too must be authored there, membership-only here").toEqual([]);
  });

  it("every row is authored exactly once — no duplicate names within this slice", () => {
    expect(duplicates(PALADIN_SPELLS_2014.map((s) => s.name))).toEqual([]);
  });

  it("no row here is ALSO authored in shared.ts, wizard.ts, cleric.ts, druid.ts, bard.ts, sorcerer.ts, or warlock.ts — the row-ownership rule forbids re-transcribing a row owned elsewhere", () => {
    const sharedNames = new Set(SHARED_SPELLS_2014.map((s) => s.name));
    const wizardNames = new Set(WIZARD_SPELLS_2014.map((s) => s.name));
    const clericNames = new Set(CLERIC_SPELLS_2014.map((s) => s.name));
    const druidNames = new Set(DRUID_SPELLS_2014.map((s) => s.name));
    const bardNames = new Set(BARD_SPELLS_2014.map((s) => s.name));
    const sorcererNames = new Set(SORCERER_SPELLS_2014.map((s) => s.name));
    const warlockNames = new Set(WARLOCK_SPELLS_2014.map((s) => s.name));
    const overlaps: Record<string, string[]> = {
      shared: PALADIN_SPELLS_2014.filter((s) => sharedNames.has(s.name)).map((s) => s.name),
      wizard: PALADIN_SPELLS_2014.filter((s) => wizardNames.has(s.name)).map((s) => s.name),
      cleric: PALADIN_SPELLS_2014.filter((s) => clericNames.has(s.name)).map((s) => s.name),
      druid: PALADIN_SPELLS_2014.filter((s) => druidNames.has(s.name)).map((s) => s.name),
      bard: PALADIN_SPELLS_2014.filter((s) => bardNames.has(s.name)).map((s) => s.name),
      sorcerer: PALADIN_SPELLS_2014.filter((s) => sorcererNames.has(s.name)).map((s) => s.name),
      warlock: PALADIN_SPELLS_2014.filter((s) => warlockNames.has(s.name)).map((s) => s.name),
    };
    for (const [file, names] of Object.entries(overlaps)) {
      expect(names, `a name authored in BOTH paladin.ts and ${file}.ts is a row-ownership violation, not just a duplicate`).toEqual([]);
    }
  });

  it("no row hardcodes its own edition — index.ts's SPELLS_2014 default is the only place that sets it", () => {
    const tagged = PALADIN_SPELLS_2014.filter((s) => s.edition !== undefined).map((s) => s.name);
    expect(tagged, "a row-level edition tag here would still work, but none of this slice's rows are edition-specific within 2014").toEqual([]);
  });
});

describe("PALADIN_SPELLS_2014 — full PHB'14 Paladin membership is complete across all authoring slices", () => {
  const CLERIC_OWNED_PALADIN_SPELLS = [
    "Bless",
    "Command",
    "Detect Evil and Good",
    "Shield of Faith",
    "Aid",
    "Revivify",
    "Death Ward",
    "Dispel Evil and Good",
  ];
  const BARD_OWNED_PALADIN_SPELLS = ["Heroism"];
  const WIZARD_OWNED_PALADIN_SPELLS = ["Magic Weapon"];

  it("every Cleric-owned spell Paladin also gets already carries paladin membership in cleric.ts (membership-only, not re-authored here)", () => {
    const missing = CLERIC_OWNED_PALADIN_SPELLS.filter((name) => {
      const row = CLERIC_SPELLS_2014.find((s) => s.name === name);
      return !row || !row.classes.includes("paladin");
    });
    expect(missing, "a Cleric-owned Paladin spell missing its paladin membership tag in cleric.ts").toEqual([]);
  });

  it("every Bard-owned spell Paladin also gets already carries paladin membership in bard.ts (membership-only, not re-authored here)", () => {
    const missing = BARD_OWNED_PALADIN_SPELLS.filter((name) => {
      const row = BARD_SPELLS_2014.find((s) => s.name === name);
      return !row || !row.classes.includes("paladin");
    });
    expect(missing, "a Bard-owned Paladin spell missing its paladin membership tag in bard.ts").toEqual([]);
  });

  it("every Wizard-owned spell Paladin also gets already carries paladin membership in wizard.ts (membership-only, not re-authored here)", () => {
    const missing = WIZARD_OWNED_PALADIN_SPELLS.filter((name) => {
      const row = WIZARD_SPELLS_2014.find((s) => s.name === name);
      return !row || !row.classes.includes("paladin");
    });
    expect(missing, "a Wizard-owned Paladin spell missing its paladin membership tag in wizard.ts").toEqual([]);
  });

  it("no Druid-owned, Sorcerer-owned, or Warlock-owned 2-list spell exists that Paladin also gets (all three outrank Paladin in the tie-break, so any such spell would be their territory, not a gap here) — all three carry zero paladin tags", () => {
    expect(DRUID_SPELLS_2014.filter((s) => s.classes.includes("paladin")).map((s) => s.name)).toEqual([]);
    expect(SORCERER_SPELLS_2014.filter((s) => s.classes.includes("paladin")).map((s) => s.name)).toEqual([]);
    expect(WARLOCK_SPELLS_2014.filter((s) => s.classes.includes("paladin")).map((s) => s.name)).toEqual([]);
  });

  it("SHARED_SPELLS_2014's paladin-tagged row count plus the three owner slices' paladin-tagged counts plus this slice's own 16 rows equals the full 44-spell PHB'14 Paladin list", () => {
    const sharedPaladinCount = SHARED_SPELLS_2014.filter((s) => s.classes.includes("paladin")).length;
    const total =
      sharedPaladinCount +
      CLERIC_OWNED_PALADIN_SPELLS.length +
      BARD_OWNED_PALADIN_SPELLS.length +
      WIZARD_OWNED_PALADIN_SPELLS.length +
      PALADIN_SPELLS_2014.length;
    expect(total).toBe(44);
  });

  it("no PHB'14 2024-only or SCAG/XGE/TCE/UA Paladin addition (e.g. Ceremony, or Find Vehicle) is offered anywhere in the 2014 tables — this slice's membership check only counts genuine 2014 core-PHB Paladin-owned spells", () => {
    const ceremony = [
      ...WIZARD_SPELLS_2014,
      ...CLERIC_SPELLS_2014,
      ...DRUID_SPELLS_2014,
      ...BARD_SPELLS_2014,
      ...SORCERER_SPELLS_2014,
      ...WARLOCK_SPELLS_2014,
      ...SHARED_SPELLS_2014,
    ].find((s) => s.name === "Ceremony");
    expect(ceremony?.classes.includes("paladin")).not.toBe(true);
    expect(PALADIN_SPELLS_2014.find((s) => s.name === "Ceremony")).toBeUndefined();
  });
});

describe("PALADIN_SPELLS_2014 — structured-field invariants (mirrors wizard.ts/cleric.ts/druid.ts/bard.ts/sorcerer.ts/warlock.ts's own blocks)", () => {
  it("cantripScaling only on cantrips (level 0) — Paladin has no cantrips at all", () => {
    const bad = PALADIN_SPELLS_2014.filter((s) => s.cantripScaling).map((s) => s.name);
    expect(bad, "Paladin has no PHB'14 cantrips; no row should ever set cantripScaling").toEqual([]);
  });

  it("no row is level 0, 6, 7, 8, or 9 — Paladin has no cantrips and caps at 5th-level spells as a half-caster", () => {
    const bad = PALADIN_SPELLS_2014.filter((s) => s.level === 0 || s.level > 5).map((s) => s.name);
    expect(bad, "a Paladin spell outside levels 1-5").toEqual([]);
  });

  it("saveEffect implies a save-based attack", () => {
    const bad = PALADIN_SPELLS_2014.filter((s) => s.saveEffect && s.attackType !== "save").map((s) => s.name);
    expect(bad, "saveEffect without attackType 'save'").toEqual([]);
  });

  it("saveEffect only appears on a damage row (shared.ts's own convention)", () => {
    const bad = PALADIN_SPELLS_2014.filter((s) => s.saveEffect && s.effectKind !== "damage").map((s) => s.name);
    expect(bad, "saveEffect set on a non-damage row").toEqual([]);
  });

  it("upcastDicePerLevel only on leveled spells (level >= 1)", () => {
    const bad = PALADIN_SPELLS_2014.filter((s) => s.upcastDicePerLevel != null && s.level < 1).map((s) => s.name);
    expect(bad, "cantrip with upcastDicePerLevel").toEqual([]);
  });

  it("effectKind 'damage'/'heal' rows carry dice; utility rows carry none", () => {
    const bad = PALADIN_SPELLS_2014.filter((s) => {
      const hasDice = s.effectDiceCount != null && s.effectDiceFaces != null;
      const isRoll = s.effectKind === "damage" || s.effectKind === "heal";
      return hasDice !== isRoll;
    }).map((s) => s.name);
    expect(bad, "dice fields not matching a damage/heal effectKind").toEqual([]);
  });

  it("damageType appears iff effectKind is 'damage' (this slice has zero direct-cast damage rows — every smite/rider spell is a conditional/multi-effect exception)", () => {
    const bad = PALADIN_SPELLS_2014.filter((s) => (s.damageType != null) !== (s.effectKind === "damage")).map((s) => s.name);
    expect(bad, "damageType present without effectKind 'damage', or vice versa").toEqual([]);
  });
});

// A row's structured saveEffect must match its own description prose, or the frontend shows contradicting "half on success" text.
describe("PALADIN_SPELLS_2014 — saveEffect matches its own description text (field/text mismatch guard)", () => {
  const HALF_ON_SUCCESS = /half as much damage|half damage|half the damage/i;

  it("saveEffect 'half' rows say so in their own description", () => {
    const bad = PALADIN_SPELLS_2014.filter((s) => s.saveEffect === "half" && !HALF_ON_SUCCESS.test(s.description)).map((s) => s.name);
    expect(bad, "saveEffect:'half' but description never says half-on-success").toEqual([]);
  });

  it("Destructive Wave says half-on-success in prose despite having no saveEffect field (documented multi-effect exception — two damage types, no single instance)", () => {
    expect(HALF_ON_SUCCESS.test(find("Destructive Wave").description)).toBe(true);
  });
});

describe("PALADIN_SPELLS_2014 — prose-vs-structured-field audit (catches what dnd5eapi's own JSON gaps hid)", () => {
  const CONDITIONAL_OR_MULTI_EFFECT = new Set([
    "Divine Favor", // 1d4 radiant is a RIDER on the caster's own future attacks, not a direct spell-cast damage instance
    "Searing Smite", // unconditional initial damage + a SEPARATE ongoing Con-save burn — two effects, no single instance
    "Thunderous Smite", // unconditional damage; the Strength save only gates the separate push/prone rider
    "Wrathful Smite", // unconditional damage; the Wisdom save only gates the separate fear rider
    "Branding Smite", // 2d6 radiant is a per-hit RIDER, not a direct spell-cast damage instance
    "Blinding Smite", // unconditional damage; the Constitution save only gates the separate blind rider
    "Crusader's Mantle", // 1d4 radiant is a RIDER on every ally's future attacks, not a direct spell-cast damage instance
    "Elemental Weapon", // a weapon-enchantment buff (extra damage on the WEAPON's future hits), not a direct spell-cast damage instance
    "Staggering Smite", // unconditional damage; the Wisdom save only gates the separate disadvantage/no-reactions rider
    "Banishing Smite", // unconditional damage; the banish trigger is an HP threshold, not a saving throw at all
    "Circle of Power", // grants OTHERS advantage on THEIR OWN future saving throws — not a save this spell itself calls for
    "Aura of Purity", // grants OTHERS advantage on THEIR OWN future saving throws — not a save this spell itself calls for
    "Destructive Wave", // two damage types on one save (5d6 thunder always + 5d6 radiant-or-necrotic choice) — no single instance
  ]);

  it("every row mentioning 'saving throw' has attackType 'save', unless documented as conditional/multi-effect", () => {
    const bad = PALADIN_SPELLS_2014.filter(
      (s) => !CONDITIONAL_OR_MULTI_EFFECT.has(s.name) && /saving throw/i.test(s.description) && s.attackType !== "save",
    ).map((s) => s.name);
    expect(bad, "prose describes a saving throw but attackType isn't 'save'").toEqual([]);
  });

  it("every row mentioning '(melee|ranged) spell attack' has attackType 'attack', unless documented as conditional/multi-effect", () => {
    const bad = PALADIN_SPELLS_2014.filter(
      (s) => !CONDITIONAL_OR_MULTI_EFFECT.has(s.name) && /\b(melee|ranged)\s+spell\s+attack/i.test(s.description) && s.attackType !== "attack",
    ).map((s) => s.name);
    expect(bad, "prose describes a spell attack but attackType isn't 'attack'").toEqual([]);
  });

  it("every attackType:'save' row has a saveAbility", () => {
    const bad = PALADIN_SPELLS_2014.filter((s) => s.attackType === "save" && !s.saveAbility).map((s) => s.name);
    expect(bad).toEqual([]);
  });

  it("Compelled Duel (this slice's only non-exception attackType:'save' row) has saveAbility 'wisdom'", () => {
    expect(find("Compelled Duel").attackType).toBe("save");
    expect(find("Compelled Duel").saveAbility).toBe("wisdom");
  });

  it("every row with an 'XdY <type> damage' phrase in prose has effectKind 'damage', unless documented as conditional/multi-effect", () => {
    const bad = PALADIN_SPELLS_2014.filter((s) => {
      if (CONDITIONAL_OR_MULTI_EFFECT.has(s.name)) return false;
      return /\d+d\d+[^.]{0,40}?damage/i.test(s.description) && s.effectKind !== "damage";
    }).map((s) => s.name);
    expect(bad, "prose describes dice damage but effectKind isn't 'damage'").toEqual([]);
  });

  it("every one of this slice's 16 rows is accounted for by either the exception set or a clean pass — no row silently escapes both", () => {
    const exceptionCount = PALADIN_SPELLS_2014.filter((s) => CONDITIONAL_OR_MULTI_EFFECT.has(s.name)).length;
    const cleanCount = PALADIN_SPELLS_2014.length - exceptionCount;
    expect(cleanCount).toBe(3);
    expect(exceptionCount).toBe(13);
  });
});

describe("PALADIN_SPELLS_2014 — no dropped 'At Higher Levels' tail text (dnd5eapi JSON-vs-real-SRD-text gap, PR #1745 review finding)", () => {
  const HAS_AT_HIGHER_LEVELS_TEXT = new Set(["Searing Smite", "Branding Smite", "Elemental Weapon"]);

  it("every row verified to have real SRD 'At Higher Levels' text actually carries it in its description", () => {
    const missing = [...HAS_AT_HIGHER_LEVELS_TEXT].filter((name) => !/At Higher Levels\./.test(find(name).description));
    expect(missing, "a row with verified upcast text is missing its 'At Higher Levels' sentence").toEqual([]);
  });

  it("no OTHER row in this slice claims 'At Higher Levels' text it wasn't verified to have (catches an accidental copy-paste in the other direction)", () => {
    const unexpected = PALADIN_SPELLS_2014.filter(
      (s) => !HAS_AT_HIGHER_LEVELS_TEXT.has(s.name) && /At Higher Levels\./.test(s.description),
    ).map((s) => s.name);
    expect(unexpected).toEqual([]);
  });
});

describe("PALADIN_SPELLS_2014 — scraping-artifact guards (same shapes spells-2014-shared/wizard/cleric/druid/bard/sorcerer/warlock-data.test.ts found live)", () => {
  it("no row carries the dnd5eapi 'GM' genericization or its 'o f'/'10d 10' scraping artifacts", () => {
    const bad = PALADIN_SPELLS_2014.filter((s) => /\bGM\b/.test(s.description) || /\bo f\b/.test(s.description) || /\d+d \d+/.test(s.description)).map(
      (s) => s.name,
    );
    expect(bad).toEqual([]);
  });

  it("no description repeats a whole word back-to-back (e.g. 'bright light bright light'), or carries a stray 'depending on the model' translation artifact", () => {
    const bad = PALADIN_SPELLS_2014.filter((s) => {
      const dupedWordPhrase = /\b(\w+ \w+)\b \1\b/i.test(s.description);
      const translationArtifact = /depending on the model/i.test(s.description);
      return dupedWordPhrase || translationArtifact;
    }).map((s) => s.name);
    expect(bad).toEqual([]);
  });

  it("no description ends a sentence on a bare 'level N.'/'slot N.' (a broken-ordinal artifact)", () => {
    const bad = PALADIN_SPELLS_2014.filter((s) => /\b(?:level|slot)s?\s+\d+\.(?:\s|$)/i.test(s.description)).map((s) => s.name);
    expect(bad).toEqual([]);
  });

  it("no description repeats the exact same sentence back to back", () => {
    const bad = PALADIN_SPELLS_2014.filter((s) => {
      const sentences = s.description.split(/(?<=[.!?])\s+/).map((sentence) => sentence.trim()).filter(Boolean);
      return sentences.some((sentence, i) => i > 0 && sentence === sentences[i - 1]);
    }).map((s) => s.name);
    expect(bad).toEqual([]);
  });

  it("no description carries a literal markdown pipe table or bold-heading asterisks (SpellDetailCard has no markdown parser)", () => {
    const bad = PALADIN_SPELLS_2014.filter((s) => /\|/.test(s.description) || /\*/.test(s.description)).map((s) => s.name);
    expect(bad).toEqual([]);
  });

  it("no description carries a stray quote mark around a bare word (e.g. dnd5eapi's \"within 'range':\")", () => {
    const bad = PALADIN_SPELLS_2014.filter((s) => /'[a-zA-Z]+'/.test(s.description)).map((s) => s.name);
    expect(bad).toEqual([]);
  });
});

function find(name: string): CatalogSpell {
  const s = PALADIN_SPELLS_2014.find((sp) => sp.name === name);
  if (!s) throw new Error(`PALADIN_SPELLS_2014 has no "${name}"`);
  return s;
}

describe("PALADIN_SPELLS_2014 — value spot-checks", () => {
  it("Divine Favor: paladin-only, bonus action, concentration, 1d4 radiant rider, no effectKind (matches Hex's shape)", () => {
    const s = find("Divine Favor");
    expect(s.classes).toEqual(["paladin"]);
    expect(s.level).toBe(1);
    expect(s.castingTime).toBe("1 bonus action");
    expect(s.concentration).toBe(true);
    expect(s.attackType).toBeUndefined();
    expect(s.effectKind).toBeUndefined();
    expect(s.description).toMatch(/extra 1d4 radiant damage/);
  });

  it("Compelled Duel: paladin-only, non-SRD (PHB'14 p. 224), Wisdom save gates the compel, no effectKind (matches Command's shape); carries the movement-restriction and spell-end conditions", () => {
    const s = find("Compelled Duel");
    expect(s.classes).toEqual(["paladin"]);
    expect(s.level).toBe(1);
    expect(s.attackType).toBe("save");
    expect(s.saveAbility).toBe("wisdom");
    expect(s.effectKind).toBeUndefined();
    expect(s.description).toMatch(/disadvantage on attack rolls against creatures other than you/);
    expect(s.description).toMatch(/The spell ends if you attack any other creature/);
  });

  it("Searing Smite: paladin-only, non-SRD (PHB'14 p. 274), 1d6 fire rider + ongoing Con-save burn, carries the +1d6-per-upcast-level clause", () => {
    const s = find("Searing Smite");
    expect(s.classes).toEqual(["paladin"]);
    expect(s.level).toBe(1);
    expect(s.concentration).toBe(true);
    expect(s.attackType).toBeUndefined();
    expect(s.effectKind).toBeUndefined();
    expect(s.description).toMatch(/extra 1d6 fire damage/);
    expect(s.description).toMatch(/Constitution saving throw/);
    expect(s.description).toMatch(/increases by 1d6 for each slot level above 1st/);
  });

  it("Thunderous Smite: paladin-only, non-SRD (PHB'14 p. 282), 2d6 thunder rider + STR-save push/prone, no upcast text", () => {
    const s = find("Thunderous Smite");
    expect(s.classes).toEqual(["paladin"]);
    expect(s.level).toBe(1);
    expect(s.description).toMatch(/extra 2d6 thunder damage/);
    expect(s.description).toMatch(/Strength saving throw or be pushed 10 feet away from you and knocked prone/);
    expect(s.description).not.toMatch(/At Higher Levels\./);
  });

  it("Wrathful Smite: paladin-only, non-SRD (PHB'14 p. 289), 1d6 psychic rider + Wisdom-save fear, self-check escape clause", () => {
    const s = find("Wrathful Smite");
    expect(s.classes).toEqual(["paladin"]);
    expect(s.level).toBe(1);
    expect(s.description).toMatch(/extra 1d6 psychic damage/);
    expect(s.description).toMatch(/frightened of you until the spell ends/);
    expect(s.description).toMatch(/Wisdom check against your spell save DC to steel its resolve/);
  });

  it("Find Steed: paladin-only, 10-minute cast, instantaneous, no damage/save/upcast at all", () => {
    const s = find("Find Steed");
    expect(s.classes).toEqual(["paladin"]);
    expect(s.level).toBe(2);
    expect(s.castingTime).toBe("10 minutes");
    expect(s.duration).toBe("Instantaneous");
    expect(s.concentration).toBeUndefined();
    expect(s.attackType).toBeUndefined();
    expect(s.effectKind).toBeUndefined();
  });

  it("Branding Smite: paladin-only, 2d6 radiant rider, carries the +1d6-per-slot-above-2nd upcast clause and the reveals-invisibility rider", () => {
    const s = find("Branding Smite");
    expect(s.classes).toEqual(["paladin"]);
    expect(s.level).toBe(2);
    expect(s.description).toMatch(/extra 2d6 radiant damage/);
    expect(s.description).toMatch(/becomes visible if it's invisible/);
    expect(s.description).toMatch(/increases by 1d6 for each slot level above 2nd/);
  });

  it("Aura of Vitality: paladin-only (Cleric/Druid access is a documented (Optional) TCE addition, not 2014 core), repeatable bonus-action 2d6 heal, no effectKind (matches Aid's shape)", () => {
    const s = find("Aura of Vitality");
    expect(s.classes).toEqual(["paladin"]);
    expect(s.level).toBe(3);
    expect(s.range).toBe("Self (30-foot radius)");
    expect(s.effectKind).toBeUndefined();
    expect(s.description).toMatch(/regain 2d6 hit points/);
  });

  it("Blinding Smite: paladin-only, non-SRD (PHB'14 p. 219), 3d8 radiant rider + Con-save blind with its own repeated end-of-turn save", () => {
    const s = find("Blinding Smite");
    expect(s.classes).toEqual(["paladin"]);
    expect(s.level).toBe(3);
    expect(s.description).toMatch(/extra 3d8 radiant damage/);
    expect(s.description).toMatch(/blinded until the spell ends/);
    expect(s.description).toMatch(/makes another Constitution saving throw at the end of each of its turns/);
  });

  it("Crusader's Mantle: paladin-only, 1d4 radiant rider on every nonhostile creature's hits, no effectKind", () => {
    const s = find("Crusader's Mantle");
    expect(s.classes).toEqual(["paladin"]);
    expect(s.level).toBe(3);
    expect(s.range).toBe("Self (30-foot radius)");
    expect(s.effectKind).toBeUndefined();
    expect(s.description).toMatch(/extra 1d4 radiant damage when it hits with a weapon attack/);
  });

  it("Elemental Weapon: paladin-only (Druid/Ranger access is a documented (Optional) addition, Artificer didn't exist in 2014), touch range, carries both upcast tiers (+2/2d4, +3/3d4)", () => {
    const s = find("Elemental Weapon");
    expect(s.classes).toEqual(["paladin"]);
    expect(s.level).toBe(3);
    expect(s.range).toBe("Touch");
    expect(s.concentration).toBe(true);
    expect(s.description).toMatch(/\+1 bonus to attack rolls and deals an extra 1d4 damage/);
    expect(s.description).toMatch(/bonus to attack rolls increases to \+2 and the extra damage increases to 2d4/);
    expect(s.description).toMatch(/bonus increases to \+3 and the extra damage increases to 3d4/);
  });

  it("Aura of Purity: paladin-only (Cleric access is a documented (Optional) TCE addition, not 2014 core), grants others advantage on their own future saves, no effectKind/attackType", () => {
    const s = find("Aura of Purity");
    expect(s.classes).toEqual(["paladin"]);
    expect(s.level).toBe(4);
    expect(s.range).toBe("Self (30-foot radius)");
    expect(s.effectKind).toBeUndefined();
    expect(s.attackType).toBeUndefined();
    expect(s.description).toMatch(/resistance to poison damage/);
  });

  it("Staggering Smite: paladin-only, non-SRD (PHB'14 p. 278), 4d6 psychic rider + Wisdom-save disadvantage/no-reactions", () => {
    const s = find("Staggering Smite");
    expect(s.classes).toEqual(["paladin"]);
    expect(s.level).toBe(4);
    expect(s.description).toMatch(/extra 4d6 psychic damage/);
    expect(s.description).toMatch(/disadvantage on attack rolls and ability checks, and can't take reactions/);
  });

  it("Banishing Smite: paladin-only, non-SRD (PHB'14 p. 218), 5d10 force rider + HP-threshold banish (no saving throw at all)", () => {
    const s = find("Banishing Smite");
    expect(s.classes).toEqual(["paladin"]);
    expect(s.level).toBe(5);
    expect(s.description).toMatch(/extra 5d10 force damage/);
    expect(s.description).toMatch(/reduces the target to 50 hit points or fewer, you banish it/);
    expect(s.description).not.toMatch(/saving throw/i);
  });

  it("Circle of Power: paladin-only, grants friendly creatures advantage on their own future saves, negates half-damage-on-success entirely, no effectKind/attackType", () => {
    const s = find("Circle of Power");
    expect(s.classes).toEqual(["paladin"]);
    expect(s.level).toBe(5);
    expect(s.range).toBe("Self (30-foot radius)");
    expect(s.effectKind).toBeUndefined();
    expect(s.attackType).toBeUndefined();
    expect(s.description).toMatch(/it instead takes no damage if it succeeds on the saving throw/);
  });

  it("Destructive Wave: paladin-only, instantaneous, Con save, 5d6 thunder ALWAYS plus 5d6 radiant-or-necrotic (caster's choice), knocks prone on a failed save, no upcast text", () => {
    const s = find("Destructive Wave");
    expect(s.classes).toEqual(["paladin"]);
    expect(s.level).toBe(5);
    expect(s.concentration).toBeUndefined();
    expect(s.duration).toBe("Instantaneous");
    expect(s.description).toMatch(/take 5d6 thunder damage, as well as 5d6 radiant or necrotic damage \(your choice\), and be knocked prone/);
    expect(s.description).not.toMatch(/At Higher Levels\./);
  });

  it("no PHB'14 2024-only Paladin addition (e.g. Cure Wounds's 2024 cantrip-scaling rewrite, or Vow of Enmity) is offered here — this slice authors only genuine 2014 Paladin-owned spells", () => {
    expect(PALADIN_SPELLS_2014.find((s) => s.name === "Vow of Enmity")).toBeUndefined();
    expect(PALADIN_SPELLS_2014.find((s) => s.name === "Ceremony")).toBeUndefined();
    expect(PALADIN_SPELLS_2014.find((s) => s.name === "Sword Burst")).toBeUndefined();
  });
});
