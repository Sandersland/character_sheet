/**
 * #1682: SpeciesTrait.improvements — passive species/variant grants
 * (FeatImprovement[]) mapped through the SAME deriveImprovementBonuses/
 * deriveImprovementProficiencies evaluator a taken feat's improvements and a
 * ClassFeature row's improvements already use (#1691's own precedent — see
 * classfeature-improvements-1691.test.ts, this file's sibling). Proving case
 * is a 2014 Hill Dwarf: Dwarven Toughness's maxHp bonus and Dwarven Combat
 * Training's weapon proficiency, both previously granted by the retired
 * name-keyed RACE_PROFICIENCY_GRANTS record (srd/proficiencies.ts) and now
 * granted by seeded SpeciesTrait rows resolved via the character's OWN
 * species/variant selection (CharacterRace.speciesId/variantId, #1679).
 *
 * speciesId/variantId are set directly on the create body — the species
 * PICKER UI ships in #1680 (parallel slice, not yet merged into this
 * worktree's base), so this bypasses it the same way
 * classfeature-improvements-1691.test.ts bypasses the (also unshipped at the
 * time) subclass picker via a raw DB update.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { prisma } from "@/lib/core/prisma.js";
import { authCookie } from "@/test-support/auth.js";

let COOKIE: string;
let createdCharacterIds: string[] = [];

beforeAll(async () => {
  COOKIE = await authCookie("owner-1682-species-trait-improvements");
});

afterEach(async () => {
  if (createdCharacterIds.length === 0) return;
  await prisma.character.deleteMany({ where: { id: { in: createdCharacterIds } } });
  createdCharacterIds = [];
});

const BASE_BODY = {
  name: "1682 Species Trait Tester",
  alignment: "True Neutral",
  background: "Acolyte",
  classes: [{ name: "Fighter" }],
  abilityScores: { strength: 12, dexterity: 12, constitution: 12, intelligence: 10, wisdom: 10, charisma: 10 },
};

async function createCharacter(overrides: Record<string, unknown>) {
  const res = await supertest(app).post("/api/characters").set("Cookie", COOKIE).send({ ...BASE_BODY, ...overrides });
  expect(res.status).toBe(201);
  createdCharacterIds.push(res.body.id);
  return res.body.id as string;
}

function get(id: string) {
  return supertest(app).get(`/api/characters/${id}`).set("Cookie", COOKIE);
}

function armorCategories(body: { armorProficiencies: { category: string }[] }): string[] {
  return body.armorProficiencies.map((p) => p.category);
}

function weaponNames(body: { weaponProficiencies: { name: string }[] }): string[] {
  return body.weaponProficiencies.map((w) => w.name);
}

describe("SpeciesTrait.improvements (#1682) — 2014 Hill Dwarf", () => {
  it("Dwarven Toughness raises max HP by 1 per applied level, Dwarven Combat Training grants the four dwarven weapons, source: 'feat' (RACE_PROFICIENCY_GRANTS retired, #1691's precedent bucket)", async () => {
    const dwarf = await prisma.species.findFirstOrThrow({ where: { slug: "dwarf", edition: "EDITION_2014" }, include: { variants: true } });
    const hillDwarf = dwarf.variants.find((v) => v.slug === "hill")!;

    const id = await createCharacter({
      rulesEdition: "EDITION_2014",
      speciesId: dwarf.id,
      variantId: hillDwarf.id,
    });

    const res = await get(id);
    expect(res.status).toBe(200);
    // Level-1 Fighter d10 + CON 14 (12 base + 2 species, #1681) → mod +2 = 12
    // base; Dwarven Toughness adds +1/level, so 13 at level 1 (the level-delta
    // proof lives in block 3).
    expect(res.body.hitDice.total).toBe(1);
    expect(res.body.hitPoints.max).toBe(13);

    const weapons = weaponNames(res.body);
    expect(weapons).toEqual(expect.arrayContaining(["Battleaxes", "Handaxes", "Light Hammers", "Warhammers"]));
    const battleaxe = res.body.weaponProficiencies.find((w: { name: string }) => w.name === "Battleaxes");
    expect(battleaxe.source).toBe("feat");

    // Species-granted sheet section (#1682): darkvision announce-only, cited SRD 5.1.
    const traitNames = res.body.speciesTraits.map((t: { name: string }) => t.name);
    expect(traitNames).toEqual(expect.arrayContaining(["Darkvision", "Dwarven Resilience", "Dwarven Combat Training", "Stonecunning", "Dwarven Toughness"]));
    const darkvision = res.body.speciesTraits.find((t: { name: string }) => t.name === "Darkvision");
    expect(darkvision.description).toContain("SRD 5.1");
  });

  it("no arithmetic crosses the wire beyond the resolved numbers — speciesTraits carries name+description only", async () => {
    const dwarf = await prisma.species.findFirstOrThrow({ where: { slug: "dwarf", edition: "EDITION_2014" }, include: { variants: true } });
    const hillDwarf = dwarf.variants.find((v) => v.slug === "hill")!;
    const id = await createCharacter({ rulesEdition: "EDITION_2014", speciesId: dwarf.id, variantId: hillDwarf.id });

    const res = await get(id);
    for (const trait of res.body.speciesTraits) {
      expect(Object.keys(trait).sort()).toEqual(["description", "name"]);
    }
  });
});

describe("SpeciesTrait.improvements (#1682) — 2014 Mountain Dwarf", () => {
  it("Dwarven Armor Training grants light + medium armor proficiency, source: 'feat'", async () => {
    const dwarf = await prisma.species.findFirstOrThrow({ where: { slug: "dwarf", edition: "EDITION_2014" }, include: { variants: true } });
    const mountainDwarf = dwarf.variants.find((v) => v.slug === "mountain")!;

    const id = await createCharacter({
      // Wizard (not Fighter/BASE_BODY's default): Wizard grants NO class armor
      // proficiency, so light/medium below is unambiguously the species grant,
      // never shadowed by class > feat push-order precedence in
      // buildMergedArmorProficiencies (Fighter is already proficient with
      // light+medium+heavy+shields, which would tag "class" first).
      classes: [{ name: "Wizard" }],
      rulesEdition: "EDITION_2014",
      speciesId: dwarf.id,
      variantId: mountainDwarf.id,
    });

    const res = await get(id);
    expect(res.status).toBe(200);
    expect(armorCategories(res.body)).toEqual(expect.arrayContaining(["light", "medium"]));
    const light = res.body.armorProficiencies.find((p: { category: string }) => p.category === "light");
    expect(light.source).toBe("feat");
    // Hill Dwarf's own Dwarven Toughness must NOT leak onto a Mountain Dwarf.
    const traitNames = res.body.speciesTraits.map((t: { name: string }) => t.name);
    expect(traitNames).not.toContain("Dwarven Toughness");
    expect(traitNames).toContain("Dwarven Armor Training");
  });
});

describe("SpeciesTrait.improvements (#1682) — level-down scales Dwarven Toughness through the existing hitDice-driven derivation, no new reconciler", () => {
  // Compares a Hill Dwarf against a Human (no maxHp-bearing trait) control
  // through the SAME level-up/level-down sequence, rather than hand-computing
  // the base class's average-method HP gain (class hit die + CON mod) — the
  // delta-of-deltas isolates Dwarven Toughness's own contribution regardless
  // of what that base number is.
  async function levelToTwoAndBack(id: string) {
    const atLevel1 = (await get(id)).body.hitPoints.max as number;
    const xpUp = await supertest(app).post(`/api/characters/${id}/experience`).set("Cookie", COOKIE).send({ operations: [{ type: "set", value: 300 }] });
    expect(xpUp.status).toBe(200);
    const levelUp = await supertest(app).post(`/api/characters/${id}/hp`).set("Cookie", COOKIE).send({ operations: [{ type: "levelUp", method: "average" }] });
    expect(levelUp.status).toBe(200);
    const atLevel2Res = await get(id);
    expect(atLevel2Res.body.hitDice.total).toBe(2);
    const atLevel2 = atLevel2Res.body.hitPoints.max as number;
    const xpDown = await supertest(app).post(`/api/characters/${id}/experience`).set("Cookie", COOKIE).send({ operations: [{ type: "set", value: 0 }] });
    expect(xpDown.status).toBe(200);
    const afterLevelDownRes = await get(id);
    expect(afterLevelDownRes.body.hitDice.total).toBe(1);
    return { atLevel1, atLevel2, afterLevelDown: afterLevelDownRes.body.hitPoints.max as number };
  }

  it("Dwarven Toughness's per-level delta is exactly 1 more than a no-species-bonus control's, in both directions", async () => {
    const dwarf = await prisma.species.findFirstOrThrow({ where: { slug: "dwarf", edition: "EDITION_2014" }, include: { variants: true } });
    const hillDwarf = dwarf.variants.find((v) => v.slug === "hill")!;
    const dwarfId = await createCharacter({ rulesEdition: "EDITION_2014", speciesId: dwarf.id, variantId: hillDwarf.id });
    // The Hill Dwarf's effective CON is 14 (12 base + 2 species, #1681). Human
    // 2014 carries no SpeciesTrait row at all (no maxHp perLevel grant) and a
    // fixed +1-to-everything increase (#1681) — base CON 13 lands the SAME
    // effective CON 14, so the per-level CON-mod contribution cancels and the
    // delta-of-deltas isolates Dwarven Toughness alone.
    const human2014 = await prisma.species.findFirstOrThrow({ where: { slug: "human", edition: "EDITION_2014" } });
    const humanId = await createCharacter({
      rulesEdition: "EDITION_2014",
      speciesId: human2014.id,
      abilityScores: { strength: 12, dexterity: 12, constitution: 13, intelligence: 10, wisdom: 10, charisma: 10 },
    });

    const dwarfResult = await levelToTwoAndBack(dwarfId);
    const humanResult = await levelToTwoAndBack(humanId);

    const dwarfDelta = dwarfResult.atLevel2 - dwarfResult.atLevel1;
    const humanDelta = humanResult.atLevel2 - humanResult.atLevel1;
    // No species-specific reconciler was added (#1682 touches no file under
    // lib/leveling/ nor LEVEL_GATED_RECONCILERS) — this +1 is entirely the
    // perLevel improvement scaling with hitDice.total (deriveImprovementBonuses,
    // srd/feats.ts), applied at read time on every serialize, the same
    // mechanism a class feature's own perLevel bonus already used.
    expect(dwarfDelta).toBe(humanDelta + 1);

    // Reversing via XP drop (revertLevelUps, an existing mechanism unrelated
    // to #1682) restores each character's own original max exactly.
    expect(dwarfResult.afterLevelDown).toBe(dwarfResult.atLevel1);
    expect(humanResult.afterLevelDown).toBe(humanResult.atLevel1);
  });
});

describe("SpeciesTrait.improvements (#1754) — base 2014 Elf Keen Senses derives fixed Perception proficiency", () => {
  it("a 2014 Wood Elf gains Perception as a derived skill proficiency and shows a Keen Senses trait", async () => {
    const elf = await prisma.species.findFirstOrThrow({ where: { slug: "elf", edition: "EDITION_2014" }, include: { variants: true } });
    const woodElf = elf.variants.find((v) => v.slug === "wood")!;

    const id = await createCharacter({ rulesEdition: "EDITION_2014", speciesId: elf.id, variantId: woodElf.id });

    const res = await get(id);
    expect(res.status).toBe(200);
    const perception = res.body.skills.find((s: { name: string }) => s.name === "perception");
    expect(perception.proficient).toBe(true);
    const traitNames = res.body.speciesTraits.map((t: { name: string }) => t.name);
    expect(traitNames).toContain("Keen Senses");
  });

  it("an Astral Elf inherits the base species-level Keen Senses: Perception proficient, and exactly ONE Keen Senses trait (no duplicate)", async () => {
    const elf = await prisma.species.findFirstOrThrow({ where: { slug: "elf", edition: "EDITION_2014" }, include: { variants: true } });
    const astralElf = elf.variants.find((v) => v.slug === "astral")!;

    // Astral Elf requires a legal floating +2/+1 spread (#1751) and, since #1756,
    // an Astral Fire cantrip pick + casting ability — both are creation
    // prerequisites unrelated to the Keen Senses grant under test.
    const light = await prisma.spell.findFirstOrThrow({ where: { name: "Light", edition: "EDITION_2014" } });
    const id = await createCharacter({
      rulesEdition: "EDITION_2014",
      speciesId: elf.id,
      variantId: astralElf.id,
      speciesAbilities: { strength: 2, wisdom: 1 },
      speciesCantripId: light.id,
      castingAbility: "wisdom",
    });

    const res = await get(id);
    expect(res.status).toBe(200);
    const perception = res.body.skills.find((s: { name: string }) => s.name === "perception");
    expect(perception.proficient).toBe(true);
    const keenSenses = res.body.speciesTraits.filter((t: { name: string }) => t.name === "Keen Senses");
    expect(keenSenses).toHaveLength(1);
  });
});

describe("SpeciesTrait.improvements (#1682) — 2024 species shows edition-specific trait text (transcription-rule fork)", () => {
  it("a 2024 Dwarf's Darkvision/Dwarven Toughness text cites SRD 5.2/PHB'24, not SRD 5.1, even where the mechanic (Dwarven Toughness maxHp) agrees", async () => {
    const dwarf2024 = await prisma.species.findFirstOrThrow({ where: { slug: "dwarf", edition: "EDITION_2024" } });
    const id = await createCharacter({ rulesEdition: "EDITION_2024", speciesId: dwarf2024.id });

    const res = await get(id);
    expect(res.status).toBe(200);
    const darkvision = res.body.speciesTraits.find((t: { name: string }) => t.name === "Darkvision");
    expect(darkvision.description).toContain("SRD 5.2");
    expect(darkvision.description).not.toContain("SRD 5.1");
    expect(darkvision.description).toContain("120 feet"); // 2024 Dwarf darkvision is 120 ft, vs 60 ft in 2014

    // 2024 Dwarven Toughness is a BASE-species trait (not variant-gated as in
    // 2014): a variantless 2024 Dwarf still gets +1/level, so a level-1 Fighter
    // with CON 12 (base 11) reads 12 — proving the base-row grant fires.
    expect(res.body.hitPoints.max).toBe(12);
  });
});
