// POST /api/characters — 2024 species-granted creation choices (#1690): 2024
// Human's Skillful (choose 1 skill, unrestricted) + Versatile (choose 1
// Origin feat), and 2024 Elf's Keen Senses (choose 1 of Insight/Perception/
// Survival). Mirrors species-creation-choices.test.ts's (#1689) structure —
// same real-seeded-catalog exercise, same both-direction no-spec pins, this
// slice's own content instead of the 2014 wave-1 rows.
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { authCookie } from "@/test-support/auth.js";
import { prisma } from "@/lib/core/prisma.js";

const OWNER_ID = "owner-species-creation-choices-2024";
let COOKIE: string;
let createdCharacterIds: string[] = [];

beforeAll(async () => {
  COOKIE = await authCookie(OWNER_ID);
});

afterEach(async () => {
  if (createdCharacterIds.length === 0) return;
  await prisma.character.deleteMany({ where: { id: { in: createdCharacterIds } } });
  createdCharacterIds = [];
});

async function post(body: object) {
  return supertest.agent(app).set("Cookie", COOKIE).post("/api/characters").send(body);
}

const BASE_SCORES = { strength: 12, dexterity: 12, constitution: 12, intelligence: 14, wisdom: 10, charisma: 10 };

// Fighter's own skill picks (2 of skillChoiceCount) + Soldier's fixed grant
// (athletics, intimidation) — the FULL class+background pool the create body
// sends (frontend's buildCreatePayload shape, mirrored here).
const CLASS_BACKGROUND_SKILLS = ["history", "insight", "athletics", "intimidation"];

async function human2024() {
  return prisma.species.findFirstOrThrow({ where: { slug: "human", edition: "EDITION_2024" } });
}
// #1683 landed the Elf lineage variants (Drow/High Elf/Wood Elf) alongside
// this slice — every 2024 Elf lineage grants a spell (species-granted-spells-
// data.ts), so a 2024 Elf create always needs BOTH variantId+castingAbility
// (#1683) AND speciesSkills (Keen Senses, this slice) — Wood Elf here purely
// to keep the fixture simple, not because the other two behave differently.
async function elf2024() {
  const elf = await prisma.species.findFirstOrThrow({
    where: { slug: "elf", edition: "EDITION_2024" },
    include: { variants: true },
  });
  const woodElf = elf.variants.find((v) => v.slug === "wood")!;
  return { elf, woodElf };
}
async function featByName(name: string) {
  // safe while these feats have no edition fork — pin edition if a 2014 sibling appears
  return prisma.feat.findFirstOrThrow({ where: { name } });
}

// Soldier's own Origin feat is Savage Attacker (catalog-data.ts) — a DIFFERENT
// feat from every species pick below unless a test says otherwise, so the
// happy-path cases never accidentally collide with the background's own grant.
const baseBody = {
  name: "2024 Species Choice Tester",
  alignment: "True Neutral",
  background: "Soldier",
  classes: [{ name: "Fighter" }],
  abilityScores: BASE_SCORES,
  skillProficiencies: CLASS_BACKGROUND_SKILLS,
  backgroundAbilities: { strength: 2, dexterity: 1 },
  rulesEdition: "EDITION_2024" as const,
};

describe("POST /api/characters — 2024 Human Skillful + Versatile (#1690)", () => {
  it("one skill + one Origin feat 201s, skill serializes proficient, feat improvements are active via the existing feat layer", async () => {
    const human = await human2024();
    const tough = await featByName("Tough");
    const res = await post({
      ...baseBody,
      speciesId: human.id,
      speciesSkills: ["stealth"],
      speciesOriginFeatId: tough.id,
    });

    expect(res.status).toBe(201);
    createdCharacterIds.push(res.body.id);

    const proficient = (res.body.skills as { name: string; proficient: boolean }[])
      .filter((s) => s.proficient)
      .map((s) => s.name)
      .sort();
    expect(proficient).toEqual([...CLASS_BACKGROUND_SKILLS, "stealth"].sort());

    // Tough: +2 maxHp per level (feats.ts) — active through the SAME feat
    // layer the background's own Origin feat rides (advancements[].improvements),
    // zero new derivation. Fighter d10 + CON mod(1) = 11 base, +2 Tough = 13.
    expect(res.body.hitPoints.max).toBe(13);

    const raceRow = await prisma.characterRace.findUniqueOrThrow({ where: { characterId: res.body.id } });
    expect(raceRow.speciesSkills).toEqual(["stealth"]);
    expect(raceRow.speciesOriginFeatName).toBe("Tough");
  });

  it("400s with a distinct message for a non-Origin-category feat", async () => {
    const human = await human2024();
    // Great Weapon Fighting is a fighting_style feat, never an Origin one.
    // Pinned to EDITION_2024 (#1311): featByName's bare name lookup became
    // ambiguous once a 2014 "Great Weapon Fighting" row existed alongside it,
    // and this create is itself a 2024 character (human2024).
    const style = await prisma.feat.findFirstOrThrow({ where: { name: "Great Weapon Fighting", edition: "EDITION_2024" } });
    const res = await post({
      ...baseBody,
      speciesId: human.id,
      speciesSkills: ["stealth"],
      speciesOriginFeatId: style.id,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not an Origin feat/);
  });

  it("400s with a distinct message when the species feat duplicates the background's own Origin feat and it is NOT repeatable", async () => {
    const human = await human2024();
    // Soldier's own Origin feat (baseBody's background) is Savage Attacker — not repeatable.
    const savageAttacker = await featByName("Savage Attacker");
    const res = await post({
      ...baseBody,
      speciesId: human.id,
      speciesSkills: ["stealth"],
      speciesOriginFeatId: savageAttacker.id,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/duplicates your background's Origin feat/);
  });

  it("201s when the species feat duplicates the background's own Origin feat and it IS repeatable (Magic Initiate)", async () => {
    const human = await human2024();
    const magicInitiate = await featByName("Magic Initiate");
    const res = await post({
      ...baseBody,
      background: "Sage", // Sage's own Origin feat (catalog-data.ts) is also Magic Initiate.
      skillProficiencies: ["history", "arcana", "athletics", "intimidation"],
      // Sage's own abilityChoices are constitution/intelligence/wisdom — baseBody's
      // strength/dexterity spread is Soldier's own, invalid here.
      backgroundAbilities: { constitution: 2, intelligence: 1 },
      speciesId: human.id,
      speciesSkills: ["stealth"],
      speciesOriginFeatId: magicInitiate.id,
    });
    expect(res.status).toBe(201);
    createdCharacterIds.push(res.body.id);
  });

  it("400s with a distinct message for the wrong skill count (0 skills)", async () => {
    const human = await human2024();
    const tough = await featByName("Tough");
    const res = await post({
      ...baseBody,
      speciesId: human.id,
      speciesSkills: [],
      speciesOriginFeatId: tough.id,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/choose exactly 1/);
  });

  it("400s when speciesOriginFeatId is omitted (the choice is required, not optional)", async () => {
    const human = await human2024();
    const res = await post({
      ...baseBody,
      speciesId: human.id,
      speciesSkills: ["stealth"],
    });
    expect(res.status).toBe(400);
  });

  it("400s an unknown feat id", async () => {
    const human = await human2024();
    const res = await post({
      ...baseBody,
      speciesId: human.id,
      speciesSkills: ["stealth"],
      speciesOriginFeatId: "00000000-0000-0000-0000-000000000000",
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/characters — 2024 Elf Keen Senses (#1690)", () => {
  it("one of Insight/Perception/Survival 201s and serializes proficient", async () => {
    const { elf, woodElf } = await elf2024();
    const res = await post({
      ...baseBody,
      speciesId: elf.id,
      variantId: woodElf.id,
      castingAbility: "wisdom",
      speciesSkills: ["perception"],
    });
    expect(res.status).toBe(201);
    createdCharacterIds.push(res.body.id);
    const proficient = (res.body.skills as { name: string; proficient: boolean }[])
      .filter((s) => s.proficient)
      .map((s) => s.name);
    expect(proficient).toContain("perception");
  });

  it("400s with a distinct message for a skill outside Insight/Perception/Survival", async () => {
    const { elf, woodElf } = await elf2024();
    const res = await post({
      ...baseBody,
      speciesId: elf.id,
      variantId: woodElf.id,
      castingAbility: "wisdom",
      speciesSkills: ["stealth"],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/unknown or ineligible/);
  });

  it("Elf carries no chooseOriginFeat spec — speciesOriginFeatId 400s", async () => {
    const { elf, woodElf } = await elf2024();
    const tough = await featByName("Tough");
    const res = await post({
      ...baseBody,
      speciesId: elf.id,
      variantId: woodElf.id,
      castingAbility: "wisdom",
      speciesSkills: ["perception"],
      speciesOriginFeatId: tough.id,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not allowed/);
  });
});

describe("POST /api/characters — chooseOriginFeat both-edition pins (#1690)", () => {
  it("a 2014 create with speciesOriginFeatId 400s — no 2014 species serves a chooseOriginFeat spec", async () => {
    const halfElf = await prisma.species.findFirstOrThrow({ where: { slug: "half-elf", edition: "EDITION_2014" } });
    const tough = await featByName("Tough");
    const res = await post({
      name: "2014 pin tester",
      alignment: "True Neutral",
      background: "Acolyte",
      classes: [{ name: "Fighter" }],
      abilityScores: BASE_SCORES,
      skillProficiencies: ["athletics", "history", "insight", "religion"],
      rulesEdition: "EDITION_2014" as const,
      speciesId: halfElf.id,
      speciesAbilities: { strength: 1, dexterity: 1 },
      speciesSkills: ["stealth", "perception"],
      speciesOriginFeatId: tough.id,
    });
    expect(res.status).toBe(400);
  });

  it("a 2024 species with no chooseOriginFeat trait (Elf) 400s on speciesOriginFeatId — pinned above; every OTHER 2024 species this slice's content doesn't touch (Dwarf) 400s too", async () => {
    const dwarf = await prisma.species.findFirstOrThrow({ where: { slug: "dwarf", edition: "EDITION_2024" } });
    const tough = await featByName("Tough");
    const res = await post({
      ...baseBody,
      speciesId: dwarf.id,
      speciesOriginFeatId: tough.id,
    });
    expect(res.status).toBe(400);
  });
});
