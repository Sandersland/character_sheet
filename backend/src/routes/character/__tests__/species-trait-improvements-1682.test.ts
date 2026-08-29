// SpeciesTrait.improvements (#1682) are mapped through the SAME deriveImprovementBonuses/deriveImprovementProficiencies evaluator a taken feat's or ClassFeature row's improvements use.
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
    // Fighter d10 + CON 14 (12 base + 2 species, #1681) → 12 base; Dwarven Toughness adds +1/level → 13 at level 1.
    expect(res.body.hitDice.total).toBe(1);
    expect(res.body.hitPoints.max).toBe(13);

    const weapons = weaponNames(res.body);
    expect(weapons).toEqual(expect.arrayContaining(["Battleaxes", "Handaxes", "Light Hammers", "Warhammers"]));
    const battleaxe = res.body.weaponProficiencies.find((w: { name: string }) => w.name === "Battleaxes");
    expect(battleaxe.source).toBe("feat");

    // Darkvision is announce-only, cited SRD 5.1.
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

    // Wizard (not Fighter) grants no class armor proficiency, so light/medium is unambiguously the species grant — buildMergedArmorProficiencies tags class-source first when both apply.
    const id = await createCharacter({
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
    const traitNames = res.body.speciesTraits.map((t: { name: string }) => t.name);
    expect(traitNames).not.toContain("Dwarven Toughness");
    expect(traitNames).toContain("Dwarven Armor Training");
  });
});

describe("SpeciesTrait.improvements (#1682) — level-down scales Dwarven Toughness through the existing hitDice-driven derivation, no new reconciler", () => {
  // Compares a Hill Dwarf against a Human control through the same level-up/down sequence — the delta-of-deltas isolates Dwarven Toughness's contribution regardless of the base HP-gain number.
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
    // Human's base CON 13 + fixed +1 (#1681) lands the SAME effective CON 14 as the Hill Dwarf, so the CON-mod contribution cancels and the delta-of-deltas isolates Dwarven Toughness alone.
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
    // No reconciler was added for this — it's the perLevel improvement scaling with hitDice.total (deriveImprovementBonuses), applied at read time on every serialize, same as a class feature's perLevel bonus.
    expect(dwarfDelta).toBe(humanDelta + 1);

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

describe("SpeciesTrait.improvements (#1762) — 2014 Half-Orc Menacing derives fixed Intimidation proficiency", () => {
  it("a 2014 Half-Orc gains Intimidation as a derived skill proficiency and shows a Menacing trait", async () => {
    const halfOrc = await prisma.species.findFirstOrThrow({ where: { slug: "half-orc", edition: "EDITION_2014" } });

    const id = await createCharacter({ rulesEdition: "EDITION_2014", speciesId: halfOrc.id });

    const res = await get(id);
    expect(res.status).toBe(200);
    const intimidation = res.body.skills.find((s: { name: string }) => s.name === "intimidation");
    expect(intimidation.proficient).toBe(true);
    const traitNames = res.body.speciesTraits.map((t: { name: string }) => t.name);
    expect(traitNames).toContain("Menacing");
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
    expect(darkvision.description).toContain("120 feet");

    // 2024 Dwarven Toughness is a base-species trait (not variant-gated like 2014) — a variantless 2024 Dwarf still gets +1/level.
    expect(res.body.hitPoints.max).toBe(12);
  });
});
