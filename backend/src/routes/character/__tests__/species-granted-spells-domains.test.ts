/**
 * 2024 lineage spell tracks (#1683) — end-to-end over the SEEDED Elf/Drow
 * rows, mirroring granted-spells-domains.test.ts's subclass twin. Proves the
 * issue's acceptance criterion directly: a 2024 Drow-lineage Elf knows
 * Dancing Lights at 1, gains Faerie Fire at 3 and Darkness at 5, all
 * always-prepared and keyed to the CharacterRace.castingAbility choice — and
 * that a level-down removes them with no persisted trace (the derived-never-
 * persisted path every subclass grant already relies on).
 */

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";

const OWNER_ID = "owner-species-granted-domains";
let COOKIE: string;
const CHAR_ID = "test-species-granted-domains-1";

// XP thresholds (levelForExperience): L1=0, L3=900, L5=6500.
const XP_LVL_1 = 0;
const XP_LVL_3 = 900;
const XP_LVL_5 = 6500;

let elfSpeciesId: string;
let drowVariantId: string;

beforeAll(async () => {
  await ensureTestOwner(OWNER_ID);
  COOKIE = await authCookie(OWNER_ID);
  const elf = await prisma.species.findFirst({
    where: { slug: "elf", edition: "EDITION_2024" },
    select: { id: true, variants: { where: { slug: "drow" }, select: { id: true } } },
  });
  if (!elf || elf.variants.length === 0) throw new Error("2024 Elf/Drow not seeded — run `prisma db seed` before tests");
  elfSpeciesId = elf.id;
  drowVariantId = elf.variants[0].id;
});

afterEach(async () => {
  await prisma.character.deleteMany({ where: { id: CHAR_ID } });
});

async function createDrowFighter(xp: number) {
  await prisma.character.create({
    data: {
      id: CHAR_ID,
      name: "Drow Fighter",
      alignment: "Neutral",
      rulesEdition: "EDITION_2024",
      experiencePoints: xp,
      initiativeBonus: 0,
      speed: 30,
      hitPoints: { current: 30, max: 30, temp: 0 },
      hitDice: { total: 5, die: "d10" },
      abilityScores: {
        strength: 16, dexterity: 12, constitution: 14,
        intelligence: 10, wisdom: 10, charisma: 14,
      },
      savingThrowProficiencies: ["strength", "constitution"],
      skills: [], toolProficiencies: [],
      currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
      ownerId: OWNER_ID,
      spellcasting: { slotsUsed: {}, spells: [] } as Prisma.InputJsonValue,
      raceSelection: {
        create: {
          name: "Drow",
          speciesId: elfSpeciesId,
          variantId: drowVariantId,
          variantName: "Drow",
          castingAbility: "charisma",
        },
      },
      // A non-caster class (#1683 AC: the grant surfaces even off a class with
      // no Spellcasting feature of its own — the granted-only view).
      classEntries: { create: [{ name: "Fighter", position: 0 }] },
    },
  });
}

interface GrantedSpell { name: string; level: number; source?: string; prepared?: boolean }

async function getCharacter(): Promise<{ ability?: string; spells: GrantedSpell[] }> {
  const res = await supertest.agent(app).set("Cookie", COOKIE).get(`/api/characters/${CHAR_ID}`);
  expect(res.status).toBe(200);
  return { ability: res.body.spellcasting?.ability, spells: (res.body.spellcasting?.spells ?? []) as GrantedSpell[] };
}

async function speciesGranted(): Promise<GrantedSpell[]> {
  return (await getCharacter()).spells.filter((s) => s.source === "species");
}

describe("Drow lineage spell track (#1683 AC)", () => {
  it("knows Dancing Lights at level 1, always-prepared, keyed to the chosen (Charisma) ability", async () => {
    await createDrowFighter(XP_LVL_1);
    const { ability, spells } = await getCharacter();
    const granted = spells.filter((s) => s.source === "species");
    expect(granted.map((s) => s.name)).toEqual(["Dancing Lights"]);
    expect(granted[0].prepared).toBe(true);
    expect(ability).toBe("charisma");
  });

  it("gains Faerie Fire at level 3 (Dancing Lights still present)", async () => {
    await createDrowFighter(XP_LVL_3);
    const names = (await speciesGranted()).map((s) => s.name).sort();
    expect(names).toEqual(["Dancing Lights", "Faerie Fire"]);
  });

  it("gains Darkness at level 5 (all three present)", async () => {
    await createDrowFighter(XP_LVL_5);
    const names = (await speciesGranted()).map((s) => s.name).sort();
    expect(names).toEqual(["Dancing Lights", "Darkness", "Faerie Fire"]);
  });

  it("a level-down removes the higher-gate grants via the derived read path — no persisted trace", async () => {
    await createDrowFighter(XP_LVL_5);
    expect((await speciesGranted()).map((s) => s.name).sort()).toEqual(["Dancing Lights", "Darkness", "Faerie Fire"]);

    const res = await supertest
      .agent(app)
      .set("Cookie", COOKIE)
      .post(`/api/characters/${CHAR_ID}/experience`)
      .send({ operations: [{ type: "set", value: XP_LVL_1 }] });
    expect(res.status).toBe(200);

    const names = (await speciesGranted()).map((s) => s.name);
    expect(names).toEqual(["Dancing Lights"]);

    // Defense-in-depth: the stored blob never carried a species-sourced entry
    // in the first place (derived-never-persisted, mirroring the subclass path).
    const row = await prisma.character.findUniqueOrThrow({ where: { id: CHAR_ID }, select: { spellcasting: true } });
    const stored = row.spellcasting as { spells?: GrantedSpell[] } | null;
    expect((stored?.spells ?? []).some((s) => s.source === "species")).toBe(false);
  });
});

// The spellcasting transaction-op layer (#1683's third wiring point, mirroring
// spellcasting.test.ts's Warrior of Shadow suite): a species-granted spell must
// be actually CASTABLE, and never forgettable (it's derived, not learned).
describe("Drow lineage spell track — spellcasting transaction ops (#1683)", () => {
  it("400s when trying to forget a species-granted spell", async () => {
    await createDrowFighter(XP_LVL_1);
    const res = await supertest.agent(app).set("Cookie", COOKIE)
      .post(`/api/characters/${CHAR_ID}/spellcasting/transactions`)
      .send({ operations: [{ type: "forgetSpell", entryId: "granted:drow:dancing-lights" }] });
    expect(res.status).toBe(400);
  });

  it("casting the granted cantrip succeeds and persists no granted entry", async () => {
    await createDrowFighter(XP_LVL_1);
    const res = await supertest.agent(app).set("Cookie", COOKIE)
      .post(`/api/characters/${CHAR_ID}/spellcasting/transactions`)
      .send({ operations: [{ type: "castSpell", entryId: "granted:drow:dancing-lights", roll: 0 }] });
    expect(res.status).toBe(200);

    // The response view still surfaces the re-derived grant.
    const dancingLights = ((res.body.spellcasting?.spells ?? []) as GrantedSpell[]).find((s) => s.name === "Dancing Lights");
    expect(dancingLights?.source).toBe("species");

    // Nothing with a granted id / species source was persisted.
    const row = await prisma.character.findUniqueOrThrow({ where: { id: CHAR_ID }, select: { spellcasting: true } });
    const stored = row.spellcasting as { spells?: GrantedSpell[] } | null;
    expect((stored?.spells ?? []).some((s) => s.source === "species")).toBe(false);
  });
});

// #1683 AC: "Lineage traits render in the species sheet section (#1682's
// component) with SRD 5.2/PHB'24 citations" — proven off the same real
// seeded Drow rows, through the SAME character.speciesTraits wire field
// species-trait-improvements-1682.test.ts already proves for 2014 Dwarf.
describe("Drow lineage traits in the species sheet section (#1683 AC)", () => {
  it("carries Superior Darkvision and Drow Lineage, both cited SRD 5.2, alongside the base Elf traits", async () => {
    await createDrowFighter(XP_LVL_1);
    const res = await supertest.agent(app).set("Cookie", COOKIE).get(`/api/characters/${CHAR_ID}`);
    expect(res.status).toBe(200);

    const traits = res.body.speciesTraits as { name: string; description: string }[];
    const names = traits.map((t) => t.name);
    // Base Elf traits (Darkvision, Fey Ancestry, Keen Senses, Trance) plus the
    // Drow-only pair — proves species-level + variant-level traits merge
    // (activeTraitRows) exactly as the 2014 Hill Dwarf suite already proves.
    expect(names).toEqual(expect.arrayContaining(["Darkvision", "Fey Ancestry", "Trance", "Superior Darkvision", "Drow Lineage"]));

    const superiorDarkvision = traits.find((t) => t.name === "Superior Darkvision")!;
    expect(superiorDarkvision.description).toContain("SRD 5.2");
    expect(superiorDarkvision.description).toContain("120 feet");

    const drowLineage = traits.find((t) => t.name === "Drow Lineage")!;
    expect(drowLineage.description).toContain("SRD 5.2");
    expect(drowLineage.description).toContain("Dancing Lights");
  });
});
