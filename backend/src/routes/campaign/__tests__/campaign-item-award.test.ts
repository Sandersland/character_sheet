/**
 * DM item award/revoke (#381). Real Postgres, supertest against createApp().
 * Fixtures: a campaign owned by OWNER with PLAYER joined; PLAYER owns a
 * character attached to the campaign, plus an OUTSIDER character in no campaign.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "../../../app.js";
import { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../../lib/prisma.js";
import { authCookie } from "../../../test-support/auth.js";
import { ensureTestOwner } from "../../../test-support/owner.js";

const OWNER = "owner-award-owner";
const PLAYER = "owner-award-player";
const CHAR = "test-award-char";
const OUTSIDER_CHAR = "test-award-outsider-char";

const app = createApp();
const agent = (cookie: string) => supertest.agent(app).set("Cookie", cookie);

const BASE_CHAR = {
  alignment: "True Neutral",
  experiencePoints: 900,
  initiativeBonus: 2,
  speed: 30,
  hitPoints: { current: 28, max: 28, temp: 0, deathSaves: { successes: 0, failures: 0 } },
  hitDice: { total: 3, die: "d10", spent: 0 },
  abilityScores: {
    strength: 16, dexterity: 14, constitution: 14,
    intelligence: 10, wisdom: 10, charisma: 8,
  },
  savingThrowProficiencies: ["strength", "constitution"],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 50, pp: 0 },
};

const weaponItem = {
  name: "Flametongue",
  category: "weapon" as const,
  rarity: "RARE" as const,
  weight: 3,
  cost: { gp: 5000 },
  weapon: { damageDiceCount: 2, damageDiceFaces: 6, damageType: "slashing" },
};

let cookieOwner: string;
let cookiePlayer: string;
let campaignId: string;

async function createItem(body: Record<string, unknown>): Promise<{ id: string; entityId: string }> {
  const res = await agent(cookieOwner).post(`/api/campaigns/${campaignId}/items`).send(body);
  expect(res.status).toBe(201);
  return { id: res.body.id, entityId: res.body.entity.id };
}

describe("campaign item award/revoke (#381)", () => {
  beforeAll(async () => {
    await ensureTestOwner(OWNER);
    await ensureTestOwner(PLAYER);
    cookieOwner = await authCookie(OWNER);
    cookiePlayer = await authCookie(PLAYER);

    await prisma.character.create({
      data: { ...BASE_CHAR, id: CHAR, name: "Bruenor", ownerId: PLAYER, spellcasting: Prisma.JsonNull },
    });
    await prisma.character.create({
      data: { ...BASE_CHAR, id: OUTSIDER_CHAR, name: "Nowhere", ownerId: PLAYER, spellcasting: Prisma.JsonNull },
    });

    const created = await agent(cookieOwner).post("/api/campaigns").send({ name: "Loot" });
    campaignId = created.body.id;
    await agent(cookiePlayer).post("/api/campaigns/join").send({ inviteCode: created.body.inviteCode });
    await agent(cookiePlayer).post(`/api/campaigns/${campaignId}/characters`).send({ characterId: CHAR });
  });

  afterAll(async () => {
    await prisma.campaign.deleteMany({ where: { id: campaignId } });
    await prisma.character.deleteMany({ where: { id: { in: [CHAR, OUTSIDER_CHAR] } } });
    await prisma.user.deleteMany({ where: { id: { in: [OWNER, PLAYER] } } });
  });

  it("awards into the target inventory with snapshot + detail, reveals entity, audits + undoes", async () => {
    const { id, entityId } = await createItem(weaponItem);

    const award = await agent(cookieOwner)
      .post(`/api/campaigns/${campaignId}/items/${id}/award`)
      .send({ characterId: CHAR, quantity: 2 });
    expect(award.status).toBe(200);
    expect(award.body.holders).toEqual([
      { characterId: CHAR, characterName: "Bruenor", quantity: 2 },
    ]);

    // Snapshot + detail landed on the sheet with provenance FK.
    const row = await prisma.inventoryItem.findFirst({
      where: { characterId: CHAR, campaignItemId: id },
      include: { weaponDetail: true },
    });
    expect(row?.name).toBe("Flametongue");
    expect(row?.quantity).toBe(2);
    expect(row?.weaponDetail?.damageDiceCount).toBe(2);

    // Award auto-revealed the fronting entity.
    const entity = await prisma.campaignEntity.findUnique({ where: { id: entityId } });
    expect(entity?.visibility).toBe("REVEALED");

    // Audit event on the TARGET character.
    const activity = await agent(cookiePlayer).get(`/api/characters/${CHAR}/activity?category=inventory`);
    const awarded = activity.body.find((e: { type: string }) => e.type === "awarded");
    expect(awarded).toBeDefined();
    expect(awarded.summary).toContain("Flametongue");

    // Undo removes it cleanly.
    const revert = await agent(cookiePlayer).post(
      `/api/characters/${CHAR}/events/${awarded.batchId}/revert`,
    );
    expect(revert.status).toBe(200);
    expect(await prisma.inventoryItem.findFirst({ where: { id: row!.id } })).toBeNull();
  });

  it("PL-1: awarding a slotted gear item snapshots slot onto the InventoryItem", async () => {
    const { id } = await createItem({ name: "Amulet of Health", category: "gear", slot: "NECK" });
    await agent(cookieOwner)
      .post(`/api/campaigns/${campaignId}/items/${id}/award`)
      .send({ characterId: CHAR });

    const row = await prisma.inventoryItem.findFirstOrThrow({
      where: { characterId: CHAR, campaignItemId: id },
    });
    expect(row.slot).toBe("NECK");
    await prisma.inventoryItem.deleteMany({ where: { campaignItemId: id } });
  });

  it("revokes a player-modified (renamed + equipped) snapshot, undoably", async () => {
    // Unique so we can also assert the unique guard still fires after undo.
    const { id } = await createItem({ ...weaponItem, name: "Sunblade", isUnique: true });
    await agent(cookieOwner)
      .post(`/api/campaigns/${campaignId}/items/${id}/award`)
      .send({ characterId: CHAR });

    const row = await prisma.inventoryItem.findFirstOrThrow({
      where: { characterId: CHAR, campaignItemId: id },
    });
    // Player renames + equips the snapshot.
    await agent(cookiePlayer)
      .post(`/api/characters/${CHAR}/inventory/transactions`)
      .send({ operations: [
        { type: "update", inventoryItemId: row.id, name: "My Sword" },
        { type: "setEquipped", inventoryItemId: row.id, equipped: true },
      ] });

    const revoke = await agent(cookieOwner)
      .post(`/api/campaigns/${campaignId}/items/${id}/revoke`)
      .send({ characterId: CHAR });
    expect(revoke.status).toBe(200);
    expect(revoke.body.holders).toEqual([]);
    expect(await prisma.inventoryItem.findFirst({ where: { id: row.id } })).toBeNull();

    // Revoke is undoable — the row comes back.
    const activity = await agent(cookiePlayer).get(`/api/characters/${CHAR}/activity?category=inventory`);
    const revoked = activity.body.find((e: { type: string }) => e.type === "revoked");
    const revert = await agent(cookiePlayer).post(
      `/api/characters/${CHAR}/events/${revoked.batchId}/revert`,
    );
    expect(revert.status).toBe(200);
    const restored = await prisma.inventoryItem.findFirst({ where: { id: row.id } });
    expect(restored?.name).toBe("My Sword");
    // The provenance FK must survive undo, or the row falls out of holder /
    // unique-guard queries (create/cleanup asymmetry).
    expect(restored?.campaignItemId).toBe(id);

    // Holders + Codex card still see the restored row.
    const list = await agent(cookieOwner).get(`/api/campaigns/${campaignId}/items`);
    const listed = list.body.find((i: { id: string }) => i.id === id);
    expect(listed.holders).toEqual([{ characterId: CHAR, characterName: "Bruenor", quantity: 1 }]);

    // Unique guard still fires — a second award stays blocked, naming the holder.
    const secondAward = await agent(cookieOwner)
      .post(`/api/campaigns/${campaignId}/items/${id}/award`)
      .send({ characterId: CHAR });
    expect(secondAward.status).toBe(409);
    expect(secondAward.body.error).toContain("Bruenor");

    // And the restored row is still revocable (not orphaned).
    const reRevoke = await agent(cookieOwner)
      .post(`/api/campaigns/${campaignId}/items/${id}/revoke`)
      .send({ characterId: CHAR });
    expect(reRevoke.status).toBe(200);

    // Cleanup for the next tests.
    await prisma.inventoryItem.deleteMany({ where: { campaignItemId: id } });
  });

  it("404s revoke when the character does not hold the item", async () => {
    const { id } = await createItem({ ...weaponItem, name: "Unheld" });
    const res = await agent(cookieOwner)
      .post(`/api/campaigns/${campaignId}/items/${id}/revoke`)
      .send({ characterId: CHAR });
    expect(res.status).toBe(404);
  });

  it("blocks a second award of a held unique item, naming the holder; succeeds after revoke", async () => {
    const { id } = await createItem({ ...weaponItem, name: "The One Ring", isUnique: true });

    const first = await agent(cookieOwner)
      .post(`/api/campaigns/${campaignId}/items/${id}/award`)
      .send({ characterId: CHAR });
    expect(first.status).toBe(200);

    const second = await agent(cookieOwner)
      .post(`/api/campaigns/${campaignId}/items/${id}/award`)
      .send({ characterId: CHAR });
    expect(second.status).toBe(409);
    expect(second.body.error).toContain("Bruenor");

    await agent(cookieOwner)
      .post(`/api/campaigns/${campaignId}/items/${id}/revoke`)
      .send({ characterId: CHAR });
    const retry = await agent(cookieOwner)
      .post(`/api/campaigns/${campaignId}/items/${id}/award`)
      .send({ characterId: CHAR });
    expect(retry.status).toBe(200);
    await prisma.inventoryItem.deleteMany({ where: { campaignItemId: id } });
  });

  it("editing the item after award changes future awards only; existing rows untouched", async () => {
    const { id } = await createItem({ ...weaponItem, name: "Original" });
    await agent(cookieOwner)
      .post(`/api/campaigns/${campaignId}/items/${id}/award`)
      .send({ characterId: CHAR });

    await agent(cookieOwner)
      .patch(`/api/campaigns/${campaignId}/items/${id}`)
      .send({ name: "Renamed" });

    const existing = await prisma.inventoryItem.findFirstOrThrow({
      where: { characterId: CHAR, campaignItemId: id },
    });
    expect(existing.name).toBe("Original");
    await prisma.inventoryItem.deleteMany({ where: { campaignItemId: id } });
  });

  it("deleting the item leaves awarded rows intact with campaignItemId = NULL (SetNull)", async () => {
    const { id } = await createItem({ ...weaponItem, name: "Doomed" });
    await agent(cookieOwner)
      .post(`/api/campaigns/${campaignId}/items/${id}/award`)
      .send({ characterId: CHAR });
    const row = await prisma.inventoryItem.findFirstOrThrow({
      where: { characterId: CHAR, campaignItemId: id },
    });

    await agent(cookieOwner).delete(`/api/campaigns/${campaignId}/items/${id}`);

    const after = await prisma.inventoryItem.findUnique({ where: { id: row.id } });
    expect(after).not.toBeNull();
    expect(after?.campaignItemId).toBeNull();
    expect(after?.name).toBe("Doomed");
    await prisma.inventoryItem.deleteMany({ where: { id: row.id } });
  });

  it("403s a non-owner; rejects awarding to a character outside the campaign", async () => {
    const { id } = await createItem({ ...weaponItem, name: "Guarded" });

    const denied = await agent(cookiePlayer)
      .post(`/api/campaigns/${campaignId}/items/${id}/award`)
      .send({ characterId: CHAR });
    expect(denied.status).toBe(403);

    const outside = await agent(cookieOwner)
      .post(`/api/campaigns/${campaignId}/items/${id}/award`)
      .send({ characterId: OUTSIDER_CHAR });
    expect(outside.status).toBe(400);
    await prisma.inventoryItem.deleteMany({ where: { campaignItemId: id } });
  });

  it("surfaces holders in the owner list and the revealed by-entity Codex card", async () => {
    const { id, entityId } = await createItem({ ...weaponItem, name: "Tracked" });
    await agent(cookieOwner)
      .post(`/api/campaigns/${campaignId}/items/${id}/award`)
      .send({ characterId: CHAR, quantity: 3 });

    const list = await agent(cookieOwner).get(`/api/campaigns/${campaignId}/items`);
    const listed = list.body.find((i: { id: string }) => i.id === id);
    expect(listed.holders).toEqual([{ characterId: CHAR, characterName: "Bruenor", quantity: 3 }]);

    // Award already revealed the entity, so the player can read the card + holders.
    const card = await agent(cookiePlayer).get(
      `/api/campaigns/${campaignId}/items/by-entity/${entityId}`,
    );
    expect(card.status).toBe(200);
    expect(card.body.holders).toEqual([{ characterId: CHAR, characterName: "Bruenor", quantity: 3 }]);
    await prisma.inventoryItem.deleteMany({ where: { campaignItemId: id } });
  });

  // ── Session-threaded loot (#382) ──────────────────────────────────────────────

  it("threads an award onto an explicit active session: log entry + end-of-session loot", async () => {
    const { id } = await createItem({ ...weaponItem, name: "Session Blade" });
    const start = await agent(cookiePlayer)
      .post(`/api/campaigns/${campaignId}/sessions`)
      .send({ characterId: CHAR, title: "Loot Night" });
    expect(start.status).toBe(201);
    const sessionId = start.body.session.id as string;

    const award = await agent(cookieOwner)
      .post(`/api/campaigns/${campaignId}/items/${id}/award`)
      .send({ characterId: CHAR, quantity: 2, sessionId });
    expect(award.status).toBe(200);

    // The loot event is threaded onto the session feed with item, recipient, qty.
    const detail = await agent(cookieOwner).get(
      `/api/campaigns/${campaignId}/sessions/${sessionId}`,
    );
    const loot = detail.body.events.find((e: { type: string }) => e.type === "awarded");
    expect(loot).toBeDefined();
    expect(loot.summary).toContain("Session Blade");
    expect(loot.data.quantityDelta).toBe(2);
    expect(loot.data.recipientName).toBe("Bruenor");

    // End-of-session summary carries the Loot line-up (recap + per participant).
    const end = await agent(cookieOwner).post(
      `/api/campaigns/${campaignId}/sessions/${sessionId}/end`,
    );
    expect(end.status).toBe(200);
    expect(end.body.session.summary.loot).toEqual([{ name: "Session Blade", qty: 2 }]);
    const participant = end.body.session.participants.find(
      (p: { characterId: string }) => p.characterId === CHAR,
    );
    expect(participant.summary.loot).toEqual([{ name: "Session Blade", qty: 2 }]);

    await prisma.inventoryItem.deleteMany({ where: { campaignItemId: id } });
  });

  it("auto-threads to the campaign's active session when no sessionId is passed", async () => {
    const { id } = await createItem({ ...weaponItem, name: "Auto Blade" });
    const start = await agent(cookiePlayer)
      .post(`/api/campaigns/${campaignId}/sessions`)
      .send({ characterId: CHAR });
    const sessionId = start.body.session.id as string;

    // No sessionId in the body — #381 behaviour still tags the active session.
    await agent(cookieOwner)
      .post(`/api/campaigns/${campaignId}/items/${id}/award`)
      .send({ characterId: CHAR });

    const detail = await agent(cookieOwner).get(
      `/api/campaigns/${campaignId}/sessions/${sessionId}`,
    );
    const loot = detail.body.events.find((e: { type: string }) => e.type === "awarded");
    expect(loot).toBeDefined();

    // Undo during the session removes both the inventory row and the log entry.
    const row = await prisma.inventoryItem.findFirstOrThrow({
      where: { characterId: CHAR, campaignItemId: id },
    });
    const revert = await agent(cookiePlayer).post(
      `/api/characters/${CHAR}/events/${loot.batchId}/revert`,
    );
    expect(revert.status).toBe(200);
    expect(await prisma.inventoryItem.findFirst({ where: { id: row.id } })).toBeNull();
    const after = await agent(cookieOwner).get(
      `/api/campaigns/${campaignId}/sessions/${sessionId}`,
    );
    const stillActive = after.body.events.find(
      (e: { type: string; reverted: boolean }) => e.type === "awarded" && !e.reverted,
    );
    expect(stillActive).toBeUndefined();

    await agent(cookieOwner).post(`/api/campaigns/${campaignId}/sessions/${sessionId}/end`);
    await prisma.inventoryItem.deleteMany({ where: { campaignItemId: id } });
  });

  it("rejects an award whose sessionId belongs to a different campaign", async () => {
    const { id } = await createItem({ ...weaponItem, name: "Cross Blade" });
    const foreignCampaign = await prisma.campaign.create({
      data: { name: "Elsewhere", ownerId: OWNER, inviteCode: `x-${Date.now()}` },
    });
    const foreignSession = await prisma.session.create({
      data: { campaignId: foreignCampaign.id, status: "active" },
    });

    const res = await agent(cookieOwner)
      .post(`/api/campaigns/${campaignId}/items/${id}/award`)
      .send({ characterId: CHAR, sessionId: foreignSession.id });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("does not belong");
    // The award was rejected — nothing landed on the sheet.
    expect(
      await prisma.inventoryItem.findFirst({ where: { characterId: CHAR, campaignItemId: id } }),
    ).toBeNull();

    await prisma.campaign.delete({ where: { id: foreignCampaign.id } });
  });
});
