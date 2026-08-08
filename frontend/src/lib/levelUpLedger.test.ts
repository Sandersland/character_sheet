import { describe, expect, it } from "vitest";

import { readHitPointsMeta } from "@/lib/hitDice";
import { buildLevelUpLedger, type LedgerResolvers, type LedgerRow } from "@/lib/levelUpLedger";
import type { LevelUpDraft } from "@/lib/levelUpSteps";
import type { Character, LevelUpPlanResponse, LevelUpStep } from "@/types/character";

const resolvers: LedgerResolvers = {
  maneuver: (id) => ({ m1: "Riposte", m2: "Trip Attack" })[id],
  spell: (id) => ({ s1: "Fireball" })[id],
  feat: (id) => ({ f1: "Sentinel", "fs-archery": "Archery" })[id],
};

function makeCharacter(over?: Partial<Character>): Character {
  return {
    // XP-derived level is already the post-up value (8) while a level-up is
    // pending; the ledger's "before" must come from the plan target, not this.
    level: 8,
    hitPoints: { max: 52 },
    hitDice: { total: 7, die: "d10" },
    abilityScores: { strength: 16, dexterity: 14, constitution: 15, intelligence: 10, wisdom: 12, charisma: 8 },
    ...over,
  } as unknown as Character;
}

// The served hitPoints meta the ledger now reads its HP numbers from (#1380):
// the ADVANCING class's d10 at the pre-level Con 15 (+2). Deliberately not the
// d6 `makeCharacter` persists, so a regression back to the aggregate die shows.
//
// #1497: effectiveMaxAverage/effectiveMaxByRoll are ALSO served, and — unlike
// every other HP_META field — they depend on the character's OWN pre-level
// max (rawMax), so this suite builds them per-test via hpMetaFor rather than
// one shared constant: a test whose character carries a different max needs a
// different effectiveMax, exactly mirroring how the real backend plan and the
// real served character are resolved off the SAME row.
function hpMetaFor(rawMax: number) {
  const conMod = 2;
  const faces = 10;
  const gainFor = (roll: number) => Math.max(1, roll + conMod);
  return {
    die: "d10",
    faces,
    conMod,
    fixedAverage: 6,
    averageGain: 8,
    minRoll: 3,
    maxRoll: 12,
    effectiveMaxAverage: rawMax + 8,
    effectiveMaxByRoll: [0, ...Array.from({ length: faces }, (_, i) => rawMax + gainFor(i + 1))],
  };
}
const HP_META = hpMetaFor(52);

function makePlan(
  steps: LevelUpStep[] = [],
  subclass: string | null = "Champion",
  hpMeta: LevelUpStep["meta"] = HP_META,
): LevelUpPlanResponse {
  return {
    target: { className: "Fighter", subclass, newLevel: 8, isPrimary: true },
    steps: [{ kind: "hitPoints", meta: hpMeta }, ...steps],
    grantedSpells: [],
  };
}

function rowFor(rows: LedgerRow[], label: string): LedgerRow | undefined {
  return rows.find((r) => r.label === label);
}

describe("buildLevelUpLedger", () => {
  it("renders level and average-HP rows and the hit-dice bump", () => {
    const rows = buildLevelUpLedger(makeCharacter(), { hp: { method: "average" } }, makePlan(), resolvers);

    expect(rowFor(rows, "Level")).toMatchObject({ before: "7", after: "8", variant: "delta" });
    // Con 15 → +2; d10 average = floor(10/2)+1+2 = 8; max 52 → 60.
    expect(rowFor(rows, "Maximum HP")).toMatchObject({ before: "52", after: "60" });
    expect(rowFor(rows, "Hit Dice")).toMatchObject({ before: "7d10", after: "8d10" });
  });

  it("a bare hp draft yields exactly the level, HP, and hit-dice rows", () => {
    const rows = buildLevelUpLedger(makeCharacter(), { hp: { method: "average" } }, makePlan(), resolvers);
    expect(rows.map((r) => r.label)).toEqual(["Level", "Maximum HP", "Hit Dice"]);
  });

  it("uses the rolled die plus Con mod for a roll draft", () => {
    const rows = buildLevelUpLedger(makeCharacter(), { hp: { method: "roll", roll: 7 } }, makePlan(), resolvers);
    // roll 7 + Con +2 = 9; max 52 → 61.
    expect(rowFor(rows, "Maximum HP")).toMatchObject({ after: "61" });
  });

  it("renders an ability row per takeAsi increase, a modifier note, and a recalculated note", () => {
    const draft: LevelUpDraft = {
      hp: { method: "average" },
      advancement: { type: "takeAsi", increases: [{ ability: "strength", amount: 2 }] },
    };
    const rows = buildLevelUpLedger(makeCharacter(), draft, makePlan(), resolvers);

    // abilityLabel must resolve, never a raw key.
    const str = rowFor(rows, "Strength");
    expect(str).toMatchObject({ before: "16", after: "18", variant: "delta" });
    // Str 16 (+3) → 18 (+4): the modifier changed, so a note appears.
    expect(str?.note).toContain("+4");
    expect(rowFor(rows, "Recalculated")).toMatchObject({ variant: "note" });
    expect(rowFor(rows, "Recalculated")?.note).toContain("Strength");
  });

  it("keeps HP gain on the pre-level Con mod even when the ASI bumps Constitution", () => {
    const draft: LevelUpDraft = {
      hp: { method: "average" },
      advancement: { type: "takeAsi", increases: [{ ability: "constitution", amount: 2 }] },
    };
    const rows = buildLevelUpLedger(makeCharacter(), draft, makePlan(), resolvers);
    // Con 15 (+2) is used for HP even though the ASI raises it to 17 (+3).
    expect(rowFor(rows, "Maximum HP")).toMatchObject({ after: "60" });
    expect(rowFor(rows, "Constitution")).toMatchObject({ before: "15", after: "17" });
  });

  it("renders a custom feat name row plus its half-feat ability bump", () => {
    const draft: LevelUpDraft = {
      hp: { method: "average" },
      advancement: {
        type: "takeFeat",
        custom: { name: "Custom Feat", description: "", abilityIncrease: 1, abilityOptions: ["dexterity"] },
        abilityChoice: "dexterity",
      },
    };
    const rows = buildLevelUpLedger(makeCharacter(), draft, makePlan(), resolvers);

    expect(rowFor(rows, "Feat")).toMatchObject({ after: "Custom Feat" });
    // Dex 14 → 15: modifier stays +2, so no note.
    const dex = rowFor(rows, "Dexterity");
    expect(dex).toMatchObject({ before: "14", after: "15" });
    expect(dex?.note).toBeUndefined();
    expect(rowFor(rows, "Recalculated")?.note).toContain("Dexterity");
  });

  it("resolves a catalog feat name through the feat resolver", () => {
    const draft: LevelUpDraft = { hp: { method: "average" }, advancement: { type: "takeFeat", featId: "f1" } };
    const rows = buildLevelUpLedger(makeCharacter(), draft, makePlan(), resolvers);
    expect(rowFor(rows, "Feat")).toMatchObject({ after: "Sentinel" });
  });

  it("reads the subclass name from the plan target", () => {
    const rows = buildLevelUpLedger(
      makeCharacter(),
      { hp: { method: "average" }, subclassId: "sc-champion" },
      makePlan(),
      resolvers,
    );
    expect(rowFor(rows, "Subclass")).toMatchObject({ after: "Champion" });
  });

  it("resolves the fighting-style feat name through the feat resolver", () => {
    const rows = buildLevelUpLedger(
      makeCharacter(),
      { hp: { method: "average" }, fightingStyleFeat: { type: "takeFeat", featId: "fs-archery", slot: "fightingStyle" } },
      makePlan(),
      resolvers,
    );
    expect(rowFor(rows, "Fighting Style")).toMatchObject({ after: "Archery" });
  });

  it("lists tool proficiencies by their display name", () => {
    const rows = buildLevelUpLedger(
      makeCharacter(),
      { hp: { method: "average" }, toolProficiencies: [{ type: "learnToolProficiency", name: "Smith's Tools" }] },
      makePlan(),
      resolvers,
    );
    expect(rowFor(rows, "Tool Proficiencies")).toMatchObject({ items: ["Smith's Tools"], variant: "list" });
  });

  it("resolves catalog picks and falls back to custom names in a list row", () => {
    const draft: LevelUpDraft = {
      hp: { method: "average" },
      maneuvers: [
        { type: "learnManeuver", maneuverId: "m1" },
        { type: "learnManeuver", custom: { name: "Homebrew Strike", description: "" } },
      ],
      spellsLearned: [{ type: "learnSpell", spellId: "s1" }],
    };
    const rows = buildLevelUpLedger(makeCharacter(), draft, makePlan(), resolvers);

    expect(rowFor(rows, "Maneuvers")?.items).toEqual(["Riposte", "Homebrew Strike"]);
    expect(rowFor(rows, "New Spells")?.items).toEqual(["Fireball"]);
  });

  it("lists learned cantrips under their own row, above New Spells (#1157)", () => {
    const draft: LevelUpDraft = {
      hp: { method: "average" },
      cantripsLearned: [{ type: "learnSpell", spellId: "s1" }],
    };
    const rows = buildLevelUpLedger(makeCharacter(), draft, makePlan(), resolvers);
    expect(rowFor(rows, "New Cantrips")).toMatchObject({ items: ["Fireball"], variant: "list" });
    expect(rowFor(rows, "New Spells")).toBeUndefined();
  });

  it("falls back to a custom cantrip's name (#1157)", () => {
    const draft: LevelUpDraft = {
      hp: { method: "average" },
      cantripsLearned: [
        {
          type: "learnSpell",
          custom: {
            name: "Homebrew Cantrip",
            level: 0,
            school: "evocation",
            castingTime: "1 action",
            range: "30 feet",
            duration: "Instantaneous",
            description: "",
          },
        },
      ],
    };
    const rows = buildLevelUpLedger(makeCharacter(), draft, makePlan(), resolvers);
    expect(rowFor(rows, "New Cantrips")).toMatchObject({ items: ["Homebrew Cantrip"] });
  });

  it("orders New Cantrips above New Spells when both are present (#1157)", () => {
    const draft: LevelUpDraft = {
      hp: { method: "average" },
      cantripsLearned: [{ type: "learnSpell", spellId: "s1" }],
      spellsLearned: [{ type: "learnSpell", spellId: "s1" }],
    };
    const rows = buildLevelUpLedger(makeCharacter(), draft, makePlan(), resolvers);
    const labels = rows.map((r) => r.label);
    expect(rowFor(rows, "New Cantrips")).toBeDefined();
    expect(rowFor(rows, "New Spells")).toBeDefined();
    expect(labels.indexOf("New Cantrips")).toBeLessThan(labels.indexOf("New Spells"));
  });

  it("renders a Forgotten row resolving the name from the character's spellbook (#1101)", () => {
    const character = makeCharacter({
      spellcasting: { slots: [], arcana: [], spells: [{ id: "k-old", name: "Charm Person", level: 1 }] },
    } as unknown as Partial<Character>);
    const draft: LevelUpDraft = {
      hp: { method: "average" },
      spellsForgotten: [{ type: "forgetSpell", entryId: "k-old" }],
      spellsLearned: [{ type: "learnSpell", spellId: "s1" }],
    };
    const rows = buildLevelUpLedger(character, draft, makePlan(), resolvers);
    expect(rowFor(rows, "Forgotten")).toMatchObject({ items: ["Charm Person"], variant: "list" });
  });

  it("falls back to the raw entry id when a forgotten spell is not in the book (#1101)", () => {
    const draft: LevelUpDraft = { hp: { method: "average" }, spellsForgotten: [{ type: "forgetSpell", entryId: "gone" }] };
    const rows = buildLevelUpLedger(makeCharacter(), draft, makePlan(), resolvers);
    expect(rowFor(rows, "Forgotten")?.items).toEqual(["gone"]);
  });

  it("renders no Forgotten row when nothing is swapped (#1101)", () => {
    const rows = buildLevelUpLedger(makeCharacter(), { hp: { method: "average" } }, makePlan(), resolvers);
    expect(rowFor(rows, "Forgotten")).toBeUndefined();
  });

  it("lists incoming granted spells (name + level + school) under the granting subclass, as an unlock card (#1139, #1159)", () => {
    const plan = {
      ...makePlan(),
      grantedSpells: [
        { name: "Lesser Restoration", level: 2, school: "abjuration" as const },
        { name: "Zone of Truth", level: 2, school: "enchantment" as const },
      ],
    };
    const rows = buildLevelUpLedger(makeCharacter(), { hp: { method: "average" } }, plan, resolvers);
    expect(rowFor(rows, "Granted by Champion")).toMatchObject({
      variant: "grantedSpells",
      grantedSpells: [
        { name: "Lesser Restoration", level: 2, school: "abjuration" },
        { name: "Zone of Truth", level: 2, school: "enchantment" },
      ],
    });
  });

  it("labels the granted-spells row generically when no subclass name is on the plan (#1139)", () => {
    const plan = { ...makePlan([], null), grantedSpells: [{ name: "Faerie Fire", level: 1, school: "evocation" as const }] };
    const rows = buildLevelUpLedger(makeCharacter(), { hp: { method: "average" } }, plan, resolvers);
    expect(rowFor(rows, "Granted Spells")).toMatchObject({
      variant: "grantedSpells",
      grantedSpells: [{ name: "Faerie Fire", level: 1, school: "evocation" }],
    });
  });

  it("renders no granted-spells row when none are incoming (#1139)", () => {
    const rows = buildLevelUpLedger(makeCharacter(), { hp: { method: "average" } }, makePlan(), resolvers);
    expect(rows.some((r) => r.label.startsWith("Granted"))).toBe(false);
  });

  it("uses the advancing class's hit die, not the persisted primary die, for a multiclass HP gain (Wizard 5 -> first Fighter level)", () => {
    // Wizard 5 (d6 hit dice persisted), first-ever Fighter level: the gain must
    // use the Fighter's d10, not the persisted d6 (#1441) — the served meta
    // already resolved that, so the persisted die never enters the arithmetic.
    const character = makeCharacter({
      hitPoints: { max: 30 },
      hitDice: { total: 5, die: "d6" },
    } as unknown as Partial<Character>);
    const rows = buildLevelUpLedger(character, { hp: { method: "average" } }, makePlan([], "Champion", hpMetaFor(30)), resolvers);
    // Con 15 → +2; d10 average = floor(10/2)+1+2 = 8; max 30 → 38 (not 36, the d6 answer).
    expect(rowFor(rows, "Maximum HP")).toMatchObject({ before: "30", after: "38" });
  });

  it("reads its HP numbers off the same plan step HitPointsStep renders — Review and the HP step cannot disagree", () => {
    const plan = makePlan([], "Champion", hpMetaFor(30));
    // readHitPointsMeta is exactly the call HitPointsStep makes on this same
    // step, so a divergence would have to be the server disagreeing with itself.
    // #1497: the "after" value is the served effectiveMaxAverage directly —
    // neither screen adds the gain to the character's own max anymore.
    const meta = readHitPointsMeta(plan.steps.find((s) => s.kind === "hitPoints"));
    const character = makeCharacter({
      hitPoints: { max: 30 },
      hitDice: { total: 5, die: "d6" },
    } as unknown as Partial<Character>);
    const rows = buildLevelUpLedger(character, { hp: { method: "average" } }, plan, resolvers);
    expect(rowFor(rows, "Maximum HP")).toMatchObject({ before: "30", after: String(meta.effectiveMaxAverage) });
  });

  // #1497: at 2014 exhaustion 4+ (PHB'14 p. 291), `character.hitPoints.max` is
  // already the halved EFFECTIVE max (15), so `max + averageGain` (15 + 8 = 23)
  // is NOT what the level-up transaction actually commits — the served
  // effectiveMaxAverage (19, halving the post-level RAW max's own parity) is.
  it("renders the served effective max, not before + gain, once exhaustion 4+ has halved the served max", () => {
    const plan: LevelUpPlanResponse = {
      ...makePlan([], "Champion", {
        die: "d10",
        faces: 10,
        conMod: 2,
        fixedAverage: 6,
        averageGain: 8,
        minRoll: 3,
        maxRoll: 12,
        effectiveMaxAverage: 19,
        effectiveMaxByRoll: [0, 14, 15, 16, 16, 17, 17, 18, 18, 19, 19],
      }),
    };
    const character = makeCharacter({ hitPoints: { max: 15 } } as unknown as Partial<Character>);
    const rows = buildLevelUpLedger(character, { hp: { method: "average" } }, plan, resolvers);
    expect(rowFor(rows, "Maximum HP")).toMatchObject({ before: "15", after: "19" });
  });

  it("floors a negative-Con roll at the served minRoll, matching the HP step and the server", () => {
    const plan: LevelUpPlanResponse = {
      ...makePlan(),
      // d6 at Con 1 (−5): every outcome is pinned to the max(1, …) level-up floor.
      steps: [
        {
          kind: "hitPoints",
          meta: {
            die: "d6",
            faces: 6,
            conMod: -5,
            fixedAverage: 4,
            averageGain: 1,
            minRoll: 1,
            maxRoll: 1,
            effectiveMaxAverage: 53,
            effectiveMaxByRoll: [0, 53, 53, 53, 53, 53, 53],
          },
        },
      ],
    };
    const rows = buildLevelUpLedger(makeCharacter(), { hp: { method: "roll", roll: 1 } }, plan, resolvers);
    expect(rowFor(rows, "Maximum HP")).toMatchObject({ before: "52", after: "53" });
  });

  it("names subclass-feature picks by custom name, else the step's meta label", () => {
    const steps: LevelUpStep[] = [
      { kind: "subclassChoice", meta: { key: "metamagic", label: "Metamagic" } },
    ];
    const draft: LevelUpDraft = {
      hp: { method: "average" },
      subclassChoices: [
        { type: "learnSubclassChoice", choiceKey: "metamagic", custom: { name: "Quickened Spell", description: "" } },
        { type: "learnSubclassChoice", choiceKey: "metamagic", optionId: "o1" },
      ],
    };
    const rows = buildLevelUpLedger(makeCharacter(), draft, makePlan(steps), resolvers);
    expect(rowFor(rows, "Subclass Features")?.items).toEqual(["Quickened Spell", "Metamagic"]);
  });
});
