// POST /api/characters — species-granted creation choices (#1689): Half-Elf's
// Skill Versatility (choose two skills) and High Elf's Cantrip (choose one
// wizard-list cantrip, Intelligence-keyed). Exercises the seeded catalog
// directly (real Species/SpeciesVariant/SpeciesTrait/Spell rows), same
// pattern as species-ability-increases-create.test.ts.
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { authCookie } from "@/test-support/auth.js";
import { prisma } from "@/lib/core/prisma.js";

const OWNER_ID = "owner-species-creation-choices";
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

// Fighter's own skill picks (2 of skillChoiceCount) + Acolyte's fixed grant
// (insight, religion) — the FULL class+background pool the create body sends
// (frontend's buildCreatePayload shape, mirrored here).
const CLASS_BACKGROUND_SKILLS = ["athletics", "history", "insight", "religion"];

const baseBody = {
  name: "Species Choice Tester",
  alignment: "True Neutral",
  background: "Acolyte",
  classes: [{ name: "Fighter" }],
  abilityScores: BASE_SCORES,
  skillProficiencies: CLASS_BACKGROUND_SKILLS,
  rulesEdition: "EDITION_2014" as const,
};

async function halfElf() {
  return prisma.species.findFirstOrThrow({ where: { slug: "half-elf", edition: "EDITION_2014" } });
}

async function highElf() {
  const elf = await prisma.species.findFirstOrThrow({
    where: { slug: "elf", edition: "EDITION_2014" },
    include: { variants: true },
  });
  return { elf, highElfVariant: elf.variants.find((v) => v.slug === "high")! };
}

async function astralElf() {
  const elf = await prisma.species.findFirstOrThrow({
    where: { slug: "elf", edition: "EDITION_2014" },
    include: { variants: true },
  });
  return { elf, astralVariant: elf.variants.find((v) => v.slug === "astral")! };
}

// #1756: a 2014 cantrip from Astral Fire's explicit list (Dancing Lights /
// Light / Sacred Flame). Pinned to EDITION_2014 for determinism, same reason
// fireBolt/magicMissile above are.
async function cantrip2014(name: string) {
  return prisma.spell.findFirstOrThrow({ where: { name, edition: "EDITION_2014" } });
}

// #1714 forked Fire Bolt to EDITION_2014 (Sorcerer+Wizard, 2-list) — this
// suite exercises BOTH a 2014 character (baseBody's default rulesEdition)
// and, at the bottom, a 2024 one (explicit override), so a single
// no-argument lookup can no longer serve every caller correctly: an
// unordered findFirstOrThrow across two same-named rows isn't guaranteed to
// return the one matching the character under test.
async function fireBolt(edition: "EDITION_2014" | "EDITION_2024" = "EDITION_2014") {
  return prisma.spell.findFirstOrThrow({ where: { name: "Fire Bolt", edition } });
}

describe("POST /api/characters — Half-Elf Skill Versatility (#1689)", () => {
  it("two distinct new skills 201s, serializes as proficient, and snapshots onto CharacterRace.speciesSkills", async () => {
    const halfElfRow = await halfElf();
    const res = await post({
      ...baseBody,
      speciesId: halfElfRow.id,
      // Half-Elf's own #1681 ability-increase choice ("+1 to two of your
      // choice") is orthogonal to this slice's skill choice but still
      // required by the same request — unrelated fields, same species.
      speciesAbilities: { strength: 1, dexterity: 1 },
      speciesSkills: ["stealth", "perception"],
    });

    expect(res.status).toBe(201);
    createdCharacterIds.push(res.body.id);
    const proficient = (res.body.skills as { name: string; proficient: boolean }[])
      .filter((s) => s.proficient)
      .map((s) => s.name)
      .sort();
    expect(proficient).toEqual([...CLASS_BACKGROUND_SKILLS, "stealth", "perception"].sort());

    const raceRow = await prisma.characterRace.findUniqueOrThrow({ where: { characterId: res.body.id } });
    expect(raceRow.speciesSkills.sort()).toEqual(["perception", "stealth"]);
  });

  it("400s with a distinct message for the wrong count (one skill instead of two)", async () => {
    const halfElfRow = await halfElf();
    const res = await post({
      ...baseBody,
      speciesId: halfElfRow.id,
      speciesSkills: ["stealth"],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/choose exactly 2/);
  });

  it("400s with a distinct message for a duplicate skill within speciesSkills", async () => {
    const halfElfRow = await halfElf();
    const res = await post({
      ...baseBody,
      speciesId: halfElfRow.id,
      speciesSkills: ["stealth", "stealth"],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/must be distinct/);
  });

  it("400s with a distinct message for an unknown skill key", async () => {
    const halfElfRow = await halfElf();
    const res = await post({
      ...baseBody,
      speciesId: halfElfRow.id,
      speciesSkills: ["stealth", "notARealSkill"],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/unknown or ineligible/);
  });

  it("400s with a distinct message when a speciesSkills pick duplicates a class/background pick", async () => {
    const halfElfRow = await halfElf();
    const res = await post({
      ...baseBody,
      speciesId: halfElfRow.id,
      speciesSkills: ["stealth", "athletics"], // athletics is already a Fighter pick
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already chosen via class\/background/);
  });

  it("400s when speciesSkills is sent for a species with no matching choice spec (Human has none)", async () => {
    const human2014 = await prisma.species.findFirstOrThrow({ where: { slug: "human", edition: "EDITION_2014" } });
    const res = await post({
      ...baseBody,
      speciesId: human2014.id,
      speciesSkills: ["stealth", "perception"],
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/characters — High Elf Cantrip (#1689)", () => {
  it("one wizard-list cantrip 201s; the sheet shows it Intelligence-keyed with a species source marker", async () => {
    const { elf, highElfVariant } = await highElf();
    const spell = await fireBolt();

    const res = await post({
      ...baseBody,
      speciesId: elf.id,
      variantId: highElfVariant.id,
      speciesCantripId: spell.id,
    });

    expect(res.status).toBe(201);
    createdCharacterIds.push(res.body.id);

    // Fighter is a non-caster: the served view is the slotless granted-only
    // shape, and its `ability` must key off the species grant (Intelligence),
    // not the subclass-derived Wisdom default (#1689's own fix).
    expect(res.body.spellcasting.ability).toBe("intelligence");
    const entry = (res.body.spellcasting.spells as Record<string, unknown>[]).find((s) => s.name === "Fire Bolt");
    expect(entry).toBeDefined();
    expect(entry!.source).toBe("species");
    expect(entry!.castingAbility).toBe("intelligence");

    const raceRow = await prisma.characterRace.findUniqueOrThrow({ where: { characterId: res.body.id } });
    expect(raceRow.speciesCantripName).toBe("Fire Bolt");
  });

  it("400s a leveled spell (Magic Missile) offered as the species cantrip", async () => {
    const { elf, highElfVariant } = await highElf();
    // #1714 forked Magic Missile to EDITION_2014 too — this character is 2014
    // rules (baseBody's default), so pin edition for determinism.
    const magicMissile = await prisma.spell.findFirstOrThrow({ where: { name: "Magic Missile", edition: "EDITION_2014" } });

    const res = await post({
      ...baseBody,
      speciesId: elf.id,
      variantId: highElfVariant.id,
      speciesCantripId: magicMissile.id,
    });
    expect(res.status).toBe(400);
  });

  it("400s an off-list cantrip (Sacred Flame, cleric-only)", async () => {
    const { elf, highElfVariant } = await highElf();
    const sacredFlame = await prisma.spell.findFirstOrThrow({ where: { name: "Sacred Flame" } });

    const res = await post({
      ...baseBody,
      speciesId: elf.id,
      variantId: highElfVariant.id,
      speciesCantripId: sacredFlame.id,
    });
    expect(res.status).toBe(400);
  });

  it("400s when speciesCantripId is omitted for a High Elf (the choice is required, not optional)", async () => {
    const { elf, highElfVariant } = await highElf();
    const res = await post({
      ...baseBody,
      speciesId: elf.id,
      variantId: highElfVariant.id,
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/characters — Astral Fire (#1756)", () => {
  // Astral Elf's floating +2/+1 spread (#1751) is required by the same request,
  // orthogonal to the cantrip choice under test here.
  const astralAbilities = { strength: 2, wisdom: 1 };

  it("a listed cantrip + chosen ability 201s; the sheet shows it species-sourced and the ability lands on CharacterRace", async () => {
    const { elf, astralVariant } = await astralElf();
    const light = await cantrip2014("Light");

    const res = await post({
      ...baseBody,
      speciesId: elf.id,
      variantId: astralVariant.id,
      speciesAbilities: astralAbilities,
      speciesCantripId: light.id,
      castingAbility: "wisdom",
    });

    expect(res.status).toBe(201);
    createdCharacterIds.push(res.body.id);

    const entry = (res.body.spellcasting.spells as Record<string, unknown>[]).find((s) => s.name === "Light");
    expect(entry).toBeDefined();
    expect(entry!.source).toBe("species");
    expect(entry!.castingAbility).toBe("wisdom");

    const raceRow = await prisma.characterRace.findUniqueOrThrow({ where: { characterId: res.body.id } });
    expect(raceRow.speciesCantripName).toBe("Light");
    expect(raceRow.castingAbility).toBe("wisdom");
  });

  it("400s an off-list cantrip (Fire Bolt, a real cantrip but not one of the three)", async () => {
    const { elf, astralVariant } = await astralElf();
    const fireBoltRow = await fireBolt();

    const res = await post({
      ...baseBody,
      speciesId: elf.id,
      variantId: astralVariant.id,
      speciesAbilities: astralAbilities,
      speciesCantripId: fireBoltRow.id,
      castingAbility: "intelligence",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/is not one of this species/);
  });

  it("400s when speciesCantripId is omitted (the cantrip choice is required)", async () => {
    const { elf, astralVariant } = await astralElf();
    const res = await post({
      ...baseBody,
      speciesId: elf.id,
      variantId: astralVariant.id,
      speciesAbilities: astralAbilities,
      castingAbility: "wisdom",
    });
    expect(res.status).toBe(400);
  });

  it("400s a valid cantrip with no castingAbility (the ability choice is required for Astral Fire)", async () => {
    const { elf, astralVariant } = await astralElf();
    const light = await cantrip2014("Light");
    const res = await post({
      ...baseBody,
      speciesId: elf.id,
      variantId: astralVariant.id,
      speciesAbilities: astralAbilities,
      speciesCantripId: light.id,
    });
    expect(res.status).toBe(400);
  });

  it("400s an invalid castingAbility value (strength is not one of Int/Wis/Cha)", async () => {
    const { elf, astralVariant } = await astralElf();
    const light = await cantrip2014("Light");
    const res = await post({
      ...baseBody,
      speciesId: elf.id,
      variantId: astralVariant.id,
      speciesAbilities: astralAbilities,
      speciesCantripId: light.id,
      castingAbility: "strength",
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/characters — no-spec pins, both directions (#1689)", () => {
  it("a 2014 species with no choice-bearing trait (Hill Dwarf) 400s on speciesSkills", async () => {
    const dwarf = await prisma.species.findFirstOrThrow({
      where: { slug: "dwarf", edition: "EDITION_2014" },
      include: { variants: true },
    });
    const hillDwarf = dwarf.variants.find((v) => v.slug === "hill")!;
    const res = await post({
      ...baseBody,
      speciesId: dwarf.id,
      variantId: hillDwarf.id,
      speciesSkills: ["stealth", "perception"],
    });
    expect(res.status).toBe(400);
  });

  it("a 2014 species with no choice-bearing trait (Hill Dwarf) 400s on speciesCantripId", async () => {
    const dwarf = await prisma.species.findFirstOrThrow({
      where: { slug: "dwarf", edition: "EDITION_2014" },
      include: { variants: true },
    });
    const hillDwarf = dwarf.variants.find((v) => v.slug === "hill")!;
    const spell = await fireBolt();
    const res = await post({
      ...baseBody,
      speciesId: dwarf.id,
      variantId: hillDwarf.id,
      speciesCantripId: spell.id,
    });
    expect(res.status).toBe(400);
  });

  // #1690 gave 2024 Human its own chooseSkills trait (Skillful), so this pin
  // now needs a 2024 species with genuinely NO choice-bearing trait — Dwarf
  // carries neither Skillful/Versatile (Human) nor Keen Senses (Elf).
  it("a 2024 species with no choice-bearing trait (Dwarf) 400s on speciesSkills", async () => {
    const dwarf2024 = await prisma.species.findFirstOrThrow({ where: { slug: "dwarf", edition: "EDITION_2024" } });
    const res = await post({
      ...baseBody,
      rulesEdition: "EDITION_2024",
      speciesId: dwarf2024.id,
      speciesSkills: ["stealth", "perception"],
    });
    expect(res.status).toBe(400);
  });

  it("a 2024 species with no choice-bearing trait (Dwarf) 400s on speciesCantripId — same pin, other field", async () => {
    const dwarf2024 = await prisma.species.findFirstOrThrow({ where: { slug: "dwarf", edition: "EDITION_2024" } });
    const spell = await fireBolt("EDITION_2024");
    const res = await post({
      ...baseBody,
      rulesEdition: "EDITION_2024",
      speciesId: dwarf2024.id,
      speciesCantripId: spell.id,
    });
    expect(res.status).toBe(400);
  });
});
