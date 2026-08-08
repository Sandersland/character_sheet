// serializeCharacter's spellcasting.spells wiring into the catalog
// entitlement resolver (#1798, epic #1795 3/6) — REPLACES no prior shim (the
// character-serialize read path had none; only GET /api/spells carried an
// interim filter, see spells.ts's own history). Real Postgres via the actual
// HTTP routes for catalog authoring/grant/fork (never re-implemented here),
// plus a direct-DB character fixture (same pattern as ac-spells.test.ts) so
// this file only exercises serializeCharacter itself.
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

const OWNER = "owner-catalog-serialize-owner"; // homebrew author
const DM = "owner-catalog-serialize-dm"; // campaign owner, forks a GLOBAL spell
const PLAYER = "owner-catalog-serialize-player"; // learns spells; owns the fixture character

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

  // OWNER authors a homebrew spell — USER scope; edition (EDITION_2014) is
  // derived from the authoring character named in the query (#1819).
  const ownerAuthorCharId = await createTestCharacter(OWNER, { edition: "EDITION_2014", name: "Catalog Serialize Author" });
  const created = await agent(cookieOwner).post(`/api/spells/custom?characterId=${ownerAuthorCharId}`).send(HOMEBREW_SPELL);
  expect(created.status).toBe(201);
  ownerEntryId = created.body.catalog.entryId;
  ownerSpellId = created.body.id;

  // DM's campaign, matching edition so the homebrew spell (2014-only) and a
  // real seeded 2014 spell both resolve for it.
  const campaign = await agent(cookieDm)
    .post("/api/campaigns")
    .send({ name: "Catalog Serialize Campaign", rulesEdition: "EDITION_2014" });
  campaignId = campaign.body.id;

  // OWNER joins so they can grant their own homebrew into the campaign.
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

  // PLAYER's character lives directly in the campaign (fixture — bypasses the
  // join ceremony; campaignId is the only field resolveSpellEntryIdsForCharacter
  // reads off the character row).
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

  // PLAYER learns OWNER's spell (granted into their shared campaign) and the
  // seeded spell that a later test forks.
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
    // PLAYER (the viewing character's owner) is neither OWNER's homebrew nor
    // any campaign's DM — editable: false (#1808 leak-fix, epic #1795 8/9).
    expect(spell!.catalog).toEqual({ entryId: ownerEntryId, scope: "USER", isFork: false, forkedFromId: null, editable: false });
  });

  it("a DM's CAMPAIGN fork of an already-learned spell shadows the original for campaign members", async () => {
    // Sanity: before forking, the learned seeded spell carries GLOBAL metadata.
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
      // PLAYER views this, not the DM — editable: false.
      expect(after!.catalog).toEqual({ entryId: forkEntryId, scope: "CAMPAIGN", isFork: true, forkedFromId: seededEntryId, editable: false });
    } finally {
      await prisma.catalogEntry.delete({ where: { id: forkEntryId } });
    }
  });

  // Regression (review finding on #1798): attachSpellCatalogMeta used to fall
  // back to matching a shadowed entry BY NAME when its own id lost precedence
  // to a fork. That name-based map was built from EVERY winning entry in the
  // whole visible candidate set (not just the character's learned spells),
  // so an unrelated, differently-lineaged same-named entry — visible but
  // never learned — could collide in it, arbitrated only by unordered
  // findMany row order, and silently serve the WRONG meta for the learned
  // (shadowed) spell, defeating the DM's override. The fix moved lineage
  // entirely into the resolver (resolveSpellEntitlementForCharacter),
  // which maps every visible candidate id — winner or shadowed — straight to
  // its OWN lineage's winner; a same-named entry from an unrelated lineage
  // never enters the lookup at all any more.
  it("an unrelated same-named USER homebrew does not defeat a DM's CAMPAIGN fork of an already-learned spell", async () => {
    // PLAYER's own homebrew, sharing the learned seeded spell's NAME but a
    // completely separate lineage (no forkedFrom) — visible (not learned) is
    // enough to have populated the old buggy name map.
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
      // PLAYER never learned the homebrew, so exactly one served entry
      // shares this name — the character's own already-learned spell, which
      // must resolve to the DM's fork, never the unrelated homebrew.
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
