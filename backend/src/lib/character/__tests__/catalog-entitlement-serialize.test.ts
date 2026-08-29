import { afterAll, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { prisma } from "@/lib/core/prisma.js";
import { authCookie } from "@/test-support/auth.js";
import { createTestCharacter } from "@/test-support/character.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { characterInclude } from "@/lib/character/character-include.js";
import { serializeCharacter } from "@/lib/character/character-serialize.js";
import { applySpellcastingOperations } from "@/lib/spellcasting/spellcasting.js";

const OWNER = "owner-catalog-serialize-owner";
const DM = "owner-catalog-serialize-dm";
const PLAYER = "owner-catalog-serialize-player";

let cookieOwner: string;
let cookieDm: string;
let cookiePlayer: string;
let campaignId: string;
let ownerEntryId: string;
let ownerSpellId: string;
let characterId: string;
let seededEntryId: string;
let seededSpellId: string;
let seededSpellName: string;

const agent = (cookie: string) => supertest.agent(app).set("Cookie", cookie);

const HOMEBREW_SPELL = {
  name: "Catalog Serialize Test Bolt",
  level: 1,
  school: "evocation",
  castingTime: "1 action",
  range: "30 feet",
  duration: "Instantaneous",
  description: "A test bolt for catalog-entitlement serialize wiring.",
  classes: ["wizard"],
  effectKind: "damage",
  effectDiceCount: 1,
  effectDiceFaces: 6,
  damageType: "force",
  attackType: "attack",
};

interface SerializedCatalogSpell {
  name: string;
  catalog?: { entryId: string; scope: string; isFork: boolean; forkedFromId: string | null; editable: boolean };
}

async function serialize() {
  const row = await prisma.character.findUniqueOrThrow({ where: { id: characterId }, include: characterInclude });
  return serializeCharacter(row);
}

function spellsOf(view: Awaited<ReturnType<typeof serialize>>): SerializedCatalogSpell[] {
  return (view.spellcasting as { spells: SerializedCatalogSpell[] }).spells;
}

beforeAll(async () => {
  await ensureTestOwner(OWNER);
  await ensureTestOwner(DM);
  await ensureTestOwner(PLAYER);
  cookieOwner = await authCookie(OWNER);
  cookieDm = await authCookie(DM);
  cookiePlayer = await authCookie(PLAYER);

  const ownerAuthorCharId = await createTestCharacter(OWNER, { edition: "EDITION_2014", name: "Catalog Serialize Author" });
  const created = await agent(cookieOwner).post(`/api/spells/custom?characterId=${ownerAuthorCharId}`).send(HOMEBREW_SPELL);
  expect(created.status).toBe(201);
  ownerEntryId = created.body.catalog.entryId;
  ownerSpellId = created.body.id;

  const campaign = await agent(cookieDm)
    .post("/api/campaigns")
    .send({ name: "Catalog Serialize Campaign", rulesEdition: "EDITION_2014" });
  campaignId = campaign.body.id;

  await agent(cookieOwner).post("/api/campaigns/join").send({ inviteCode: campaign.body.inviteCode });
  const grant = await agent(cookieOwner).post(`/api/catalog/entries/${ownerEntryId}/grants`).send({ campaignId });
  expect(grant.status).toBe(201);

  const seeded = await prisma.spell.findFirstOrThrow({
    where: { edition: "EDITION_2014" },
    orderBy: { name: "asc" },
  });
  seededEntryId = seeded.catalogEntryId;
  seededSpellId = seeded.id;
  seededSpellName = seeded.name;

  // resolveSpellEntryIdsForCharacter only reads campaignId off the character row, so this fixture skips the join ceremony.
  const character = await prisma.character.create({
    data: {
      name: "Catalog Serialize Player Character",
      ownerId: PLAYER,
      campaignId,
      rulesEdition: "EDITION_2014",
      alignment: "Neutral",
      initiativeBonus: 0,
      speed: 30,
      hitPoints: { current: 10, max: 10, temp: 0 },
      hitDice: { total: 1, die: "d6" },
      abilityScores: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
      savingThrowProficiencies: [],
      skills: [],
      toolProficiencies: [],
      currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
      classEntries: { create: { name: "Wizard", level: 1, position: 0 } },
    },
  });
  characterId = character.id;

  await applySpellcastingOperations(characterId, [{ type: "learnSpell", spellId: ownerSpellId }], PLAYER);
  await applySpellcastingOperations(characterId, [{ type: "learnSpell", spellId: seededSpellId }], PLAYER);
});

afterAll(async () => {
  await prisma.character.deleteMany({ where: { ownerId: PLAYER } });
  await prisma.catalogEntry.deleteMany({ where: { ownerUserId: { in: [OWNER, DM, PLAYER] } } });
  if (campaignId) await prisma.catalogEntry.deleteMany({ where: { ownerCampaignId: campaignId } });
  await prisma.campaign.deleteMany({ where: { id: campaignId } });
  await prisma.user.deleteMany({ where: { id: { in: [OWNER, DM, PLAYER] } } });
});

describe("serializeCharacter — catalog entitlement wiring (#1798, epic #1795 3/6)", () => {
  it("a spell granted into the character's campaign appears on the sheet, carrying catalog.{scope,isFork,forkedFromId}", async () => {
    const spell = spellsOf(await serialize()).find((s) => s.name === HOMEBREW_SPELL.name);
    expect(spell).toBeDefined();
    expect(spell!.catalog).toEqual({ entryId: ownerEntryId, scope: "USER", isFork: false, forkedFromId: null, editable: false });
  });

  it("a DM's CAMPAIGN fork of an already-learned spell shadows the original for campaign members", async () => {
    const before = spellsOf(await serialize()).find((s) => s.name === seededSpellName);
    expect(before!.catalog).toEqual({ entryId: seededEntryId, scope: "GLOBAL", isFork: false, forkedFromId: null, editable: false });

    const fork = await agent(cookieDm)
      .post(`/api/catalog/entries/${seededEntryId}/fork`)
      .send({ scope: "CAMPAIGN", campaignId });
    expect(fork.status).toBe(201);
    const forkEntryId = fork.body.entryId as string;

    try {
      const after = spellsOf(await serialize()).find((s) => s.name === seededSpellName);
      expect(after).toBeDefined();
      expect(after!.catalog).toEqual({ entryId: forkEntryId, scope: "CAMPAIGN", isFork: true, forkedFromId: seededEntryId, editable: false });
    } finally {
      await prisma.catalogEntry.delete({ where: { id: forkEntryId } });
    }
  });

  it("an unrelated same-named USER homebrew does not defeat a DM's CAMPAIGN fork of an already-learned spell", async () => {
    const collidingHomebrew = await agent(cookiePlayer)
      .post(`/api/spells/custom?characterId=${characterId}`)
      .send({ ...HOMEBREW_SPELL, name: seededSpellName });
    expect(collidingHomebrew.status).toBe(201);
    const collidingEntryId = collidingHomebrew.body.catalog.entryId as string;

    const fork = await agent(cookieDm)
      .post(`/api/catalog/entries/${seededEntryId}/fork`)
      .send({ scope: "CAMPAIGN", campaignId });
    expect(fork.status).toBe(201);
    const forkEntryId = fork.body.entryId as string;

    try {
      const spell = spellsOf(await serialize()).find((s) => s.name === seededSpellName);
      expect(spell).toBeDefined();
      expect(spell!.catalog).toEqual({ entryId: forkEntryId, scope: "CAMPAIGN", isFork: true, forkedFromId: seededEntryId, editable: false });
      expect(spell!.catalog?.entryId).not.toBe(collidingEntryId);
    } finally {
      await prisma.catalogEntry.delete({ where: { id: forkEntryId } });
      await prisma.catalogEntry.delete({ where: { id: collidingEntryId } });
    }
  });
});
