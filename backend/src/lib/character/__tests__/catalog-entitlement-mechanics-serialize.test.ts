// serializeCharacter's read-time MECHANICS override for a learned catalog
// spell whose lineage has a winning fork (#1806, epic #1795 7/7) — extends
// #1798's catalog.{scope,isFork,forkedFromId} wiring (see the sibling
// catalog-entitlement-serialize.test.ts) to the spell's actual MECHANICS
// (dice/description), resolved through the SAME lineage-winner computation
// that file's tests pin, never a second precedence path. Real Postgres via
// the actual HTTP routes for catalog authoring/grant/fork; a direct-DB
// character fixture (same pattern as the sibling file) so this file only
// exercises serializeCharacter itself.
//
// A DM's CAMPAIGN-scope fork has no HTTP mechanics-edit route yet (PATCH
// /api/spells/custom/:id's assertSpellOwnership only recognizes
// ownerUserId, not ownerCampaignId — a gap outside this slice's scope), so
// "the DM changed the dice" is simulated with a direct prisma.spell.update
// on the forked Spell row; a USER-scope fork the forker owns IS reachable
// through the real PATCH route and is exercised through it below.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { prisma } from "@/lib/core/prisma.js";
import { authCookie } from "@/test-support/auth.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { characterInclude } from "@/lib/character/character-include.js";
import { serializeCharacter } from "@/lib/character/character-serialize.js";
import { applySpellcastingOperations } from "@/lib/spellcasting/spellcasting.js";

const DM = "owner-catalog-mech-dm";
const MEMBER_A = "owner-catalog-mech-member-a"; // never forks; sees the precedence-correct winner
const MEMBER_B = "owner-catalog-mech-member-b"; // forks their own USER copy

let cookieDm: string;
let cookieMemberA: string;
let cookieMemberB: string;
let campaignId: string;
let seededEntryId: string;
let seededSpellId: string;
let seededSpellName: string;
let seededDice: { effectDiceCount: number; effectDiceFaces: number };
let characterAId: string;
let characterBId: string;

const agent = (cookie: string) => supertest.agent(app).set("Cookie", cookie);

interface SerializedMechanicsSpell {
  id: string;
  spellId?: string;
  name: string;
  description: string;
  effectDiceCount?: number;
  effectDiceFaces?: number;
  catalog?: { entryId: string; scope: string; isFork: boolean; forkedFromId: string | null };
}

async function serializeSpells(characterId: string): Promise<SerializedMechanicsSpell[]> {
  const row = await prisma.character.findUniqueOrThrow({ where: { id: characterId }, include: characterInclude });
  const view = await serializeCharacter(row);
  return (view.spellcasting as { spells: SerializedMechanicsSpell[] }).spells;
}

async function createCampaignCharacter(ownerId: string, name: string): Promise<string> {
  const character = await prisma.character.create({
    data: {
      name,
      ownerId,
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
  return character.id;
}

beforeAll(async () => {
  await ensureTestOwner(DM);
  await ensureTestOwner(MEMBER_A);
  await ensureTestOwner(MEMBER_B);
  cookieDm = await authCookie(DM);
  cookieMemberA = await authCookie(MEMBER_A);
  cookieMemberB = await authCookie(MEMBER_B);

  const campaign = await agent(cookieDm)
    .post("/api/campaigns")
    .send({ name: "Catalog Mechanics Serialize Campaign", rulesEdition: "EDITION_2014" });
  campaignId = campaign.body.id;

  // A damage spell (dice present, and effectKind "damage" so a USER-fork PATCH
  // through customSpellSchema — which accepts only "damage"/"heal" — stays
  // legal) with at least one class, so learnSpell's snapshot has real dice to
  // compare against later.
  const seeded = await prisma.spell.findFirstOrThrow({
    where: { edition: "EDITION_2014", effectKind: "damage", effectDiceCount: { not: null }, effectDiceFaces: { not: null } },
    orderBy: { name: "asc" },
  });
  seededEntryId = seeded.catalogEntryId;
  seededSpellId = seeded.id;
  seededSpellName = seeded.name;
  seededDice = { effectDiceCount: seeded.effectDiceCount!, effectDiceFaces: seeded.effectDiceFaces! };

  characterAId = await createCampaignCharacter(MEMBER_A, "Catalog Mechanics Member A");
  characterBId = await createCampaignCharacter(MEMBER_B, "Catalog Mechanics Member B");

  await applySpellcastingOperations(characterAId, [{ type: "learnSpell", spellId: seededSpellId }], MEMBER_A);
  await applySpellcastingOperations(characterBId, [{ type: "learnSpell", spellId: seededSpellId }], MEMBER_B);
});

afterAll(async () => {
  await prisma.character.deleteMany({ where: { ownerId: { in: [MEMBER_A, MEMBER_B] } } });
  await prisma.catalogEntry.deleteMany({ where: { ownerUserId: { in: [DM, MEMBER_A, MEMBER_B] } } });
  if (campaignId) await prisma.catalogEntry.deleteMany({ where: { ownerCampaignId: campaignId } });
  await prisma.campaign.deleteMany({ where: { id: campaignId } });
  await prisma.user.deleteMany({ where: { id: { in: [DM, MEMBER_A, MEMBER_B] } } });
});

describe("serializeCharacter — catalog fork MECHANICS override (#1806, epic #1795 7/7)", () => {
  it("a non-forked learned spell keeps its stored snapshot even after the origin catalog row later changes", async () => {
    const homebrew = await agent(cookieMemberA)
      .post("/api/spells/custom")
      .send({
        name: "Mechanics Serialize Untouched Bolt",
        level: 1,
        school: "evocation",
        castingTime: "1 action",
        range: "30 feet",
        duration: "Instantaneous",
        description: "Original description.",
        classes: ["wizard"],
        effectKind: "damage",
        effectDiceCount: 2,
        effectDiceFaces: 6,
        damageType: "force",
        attackType: "attack",
      });
    expect(homebrew.status).toBe(201);
    const homebrewSpellId = homebrew.body.id as string;

    await applySpellcastingOperations(characterAId, [{ type: "learnSpell", spellId: homebrewSpellId }], MEMBER_A);

    const before = (await serializeSpells(characterAId)).find((s) => s.spellId === homebrewSpellId);
    expect(before).toBeDefined();
    expect(before!.description).toBe("Original description.");
    expect(before!.effectDiceCount).toBe(2);
    expect(before!.effectDiceFaces).toBe(6);
    expect(before!.catalog?.isFork).toBe(false);

    // No fork exists — the origin row changing directly must NOT re-hydrate
    // the already-learned snapshot (CLAUDE.md "derive, don't persist" cuts
    // the other way here: a stored snapshot is the persisted source of truth
    // until a FORK's lineage actually outranks it).
    await prisma.spell.update({
      where: { id: homebrewSpellId },
      data: { description: "Mutated directly, no fork.", effectDiceCount: 9, effectDiceFaces: 12 },
    });

    const after = (await serializeSpells(characterAId)).find((s) => s.spellId === homebrewSpellId);
    expect(after!.description).toBe("Original description.");
    expect(after!.effectDiceCount).toBe(2);
    expect(after!.effectDiceFaces).toBe(6);
  });

  it("a DM's CAMPAIGN fork overrides the dice for a member who already learned the origin, and deleting the fork reverts the view", async () => {
    const before = (await serializeSpells(characterAId)).find((s) => s.spellId === seededSpellId);
    expect(before).toBeDefined();
    expect(before!.effectDiceCount).toBe(seededDice.effectDiceCount);
    expect(before!.effectDiceFaces).toBe(seededDice.effectDiceFaces);
    const learnedEntryId = before!.id;

    const fork = await agent(cookieDm)
      .post(`/api/catalog/entries/${seededEntryId}/fork`)
      .send({ scope: "CAMPAIGN", campaignId });
    expect(fork.status).toBe(201);
    const forkEntryId = fork.body.entryId as string;
    const forkSpellId = fork.body.spell.id as string;
    const newDice = { effectDiceCount: seededDice.effectDiceCount + 5, effectDiceFaces: 20 };

    try {
      // Simulates "the DM changed the damage dice" — see the file banner for
      // why this is a direct write rather than the (not-yet-built) HTTP route.
      await prisma.spell.update({ where: { id: forkSpellId }, data: newDice });

      const after = (await serializeSpells(characterAId)).find((s) => s.id === learnedEntryId);
      expect(after).toBeDefined();
      expect(after!.effectDiceCount).toBe(newDice.effectDiceCount);
      expect(after!.effectDiceFaces).toBe(newDice.effectDiceFaces);
      // Identity — the learned entry's own id and catalog spellId provenance
      // — is preserved; only mechanics are overlaid.
      expect(after!.id).toBe(learnedEntryId);
      expect(after!.spellId).toBe(seededSpellId);
      expect(after!.name).toBe(seededSpellName);
      expect(after!.catalog).toEqual({ entryId: forkEntryId, scope: "CAMPAIGN", isFork: true, forkedFromId: seededEntryId });
    } finally {
      await prisma.catalogEntry.delete({ where: { id: forkEntryId } });
    }

    const reverted = (await serializeSpells(characterAId)).find((s) => s.id === learnedEntryId);
    expect(reverted!.effectDiceCount).toBe(seededDice.effectDiceCount);
    expect(reverted!.effectDiceFaces).toBe(seededDice.effectDiceFaces);
    expect(reverted!.catalog).toEqual({ entryId: seededEntryId, scope: "GLOBAL", isFork: false, forkedFromId: null });
  });

  it("a player's own USER fork overrides their view by description; a fellow member with no fork sees the DM's CAMPAIGN fork instead", async () => {
    const campaignFork = await agent(cookieDm)
      .post(`/api/catalog/entries/${seededEntryId}/fork`)
      .send({ scope: "CAMPAIGN", campaignId });
    expect(campaignFork.status).toBe(201);
    const campaignForkEntryId = campaignFork.body.entryId as string;
    const campaignForkSpellId = campaignFork.body.spell.id as string;
    const campaignDescription = "DM's campaign-wide rewrite.";
    await prisma.spell.update({ where: { id: campaignForkSpellId }, data: { description: campaignDescription } });

    const userFork = await agent(cookieMemberB)
      .post(`/api/catalog/entries/${seededEntryId}/fork`)
      .send({ scope: "USER" });
    expect(userFork.status).toBe(201);
    const userForkEntryId = userFork.body.entryId as string;
    const forkedSpell = userFork.body.spell as {
      id: string;
      name: string;
      level: number;
      school: string;
      castingTime: string;
      range: string;
      duration: string;
      classes: string[];
      concentration: boolean;
      ritual: boolean;
      effectKind?: string;
      effectDiceCount?: number;
      effectDiceFaces?: number;
      effectModifier?: number;
      damageType?: string;
      attackType?: string;
      saveAbility?: string;
      saveEffect?: string;
      upcastDicePerLevel?: number;
    };
    const playerDescription = "My own personal rewrite.";

    try {
      const patch = await agent(cookieMemberB).patch(`/api/spells/custom/${forkedSpell.id}`).send({
        name: forkedSpell.name,
        level: forkedSpell.level,
        school: forkedSpell.school,
        castingTime: forkedSpell.castingTime,
        range: forkedSpell.range,
        duration: forkedSpell.duration,
        description: playerDescription,
        concentration: forkedSpell.concentration,
        ritual: forkedSpell.ritual,
        classes: forkedSpell.classes,
        effectKind: forkedSpell.effectKind,
        effectDiceCount: forkedSpell.effectDiceCount,
        effectDiceFaces: forkedSpell.effectDiceFaces,
        effectModifier: forkedSpell.effectModifier,
        damageType: forkedSpell.damageType,
        attackType: forkedSpell.attackType,
        saveAbility: forkedSpell.saveAbility,
        saveEffect: forkedSpell.saveEffect,
        upcastDicePerLevel: forkedSpell.upcastDicePerLevel,
      });
      expect(patch.status).toBe(200);

      const bSpells = await serializeSpells(characterBId);
      const bSpell = bSpells.find((s) => s.spellId === seededSpellId);
      expect(bSpell!.description).toBe(playerDescription);
      expect(bSpell!.catalog).toEqual({ entryId: userForkEntryId, scope: "USER", isFork: true, forkedFromId: seededEntryId });

      const aSpells = await serializeSpells(characterAId);
      const aSpell = aSpells.find((s) => s.spellId === seededSpellId);
      expect(aSpell!.description).toBe(campaignDescription);
      expect(aSpell!.catalog).toEqual({ entryId: campaignForkEntryId, scope: "CAMPAIGN", isFork: true, forkedFromId: seededEntryId });
    } finally {
      await prisma.catalogEntry.delete({ where: { id: userForkEntryId } });
      await prisma.catalogEntry.delete({ where: { id: campaignForkEntryId } });
    }
  });
});
