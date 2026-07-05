import { afterAll, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "../../app.js";
import { prisma } from "../../lib/prisma.js";
import { authCookie } from "../../test-support/auth.js";
import { ensureTestOwner } from "../../test-support/owner.js";

// Unique fixture ids for this file (parallel-safe on the shared dev DB).
const OWNER = "owner-campaign-items-owner";
const PLAYER = "owner-campaign-items-player";

const app = createApp();

const weaponItem = {
  name: "Flametongue",
  description: "A blade wreathed in fire.",
  category: "weapon" as const,
  rarity: "rare",
  requiresAttunement: true,
  isUnique: false,
  weight: 3,
  cost: { gp: 5000 },
  dmNotes: "Reward for clearing the crypt.",
  weapon: { damageDiceCount: 1, damageDiceFaces: 8, damageType: "slashing" },
};

describe("campaign items (#380)", () => {
  let cookieOwner: string;
  let cookiePlayer: string;
  let campaignId: string;

  beforeAll(async () => {
    await ensureTestOwner(OWNER);
    await ensureTestOwner(PLAYER);
    cookieOwner = await authCookie(OWNER);
    cookiePlayer = await authCookie(PLAYER);

    const created = await supertest(app)
      .post("/api/campaigns")
      .set("Cookie", cookieOwner)
      .send({ name: "Loot Campaign" });
    campaignId = created.body.id;
    const code = created.body.inviteCode as string;
    await supertest(app).post("/api/campaigns/join").set("Cookie", cookiePlayer).send({ inviteCode: code });
  });

  afterAll(async () => {
    await prisma.campaign.deleteMany({ where: { id: campaignId } });
    await prisma.user.deleteMany({ where: { id: { in: [OWNER, PLAYER] } } });
  });

  it("creates an item and auto-links a HIDDEN ITEM entity", async () => {
    const res = await supertest(app)
      .post(`/api/campaigns/${campaignId}/items`)
      .set("Cookie", cookieOwner)
      .send(weaponItem);
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Flametongue");
    expect(res.body.category).toBe("weapon");
    expect(res.body.weapon.damageDiceFaces).toBe(8);
    expect(res.body.entity.visibility).toBe("HIDDEN");

    const entity = await prisma.campaignEntity.findUnique({ where: { id: res.body.entity.id } });
    expect(entity?.type).toBe("ITEM");
    expect(entity?.visibility).toBe("HIDDEN");
    expect(entity?.name).toBe("Flametongue");
    const link = await prisma.campaignItemLink.findUnique({ where: { campaignItemId: res.body.id } });
    expect(link?.campaignEntityId).toBe(res.body.entity.id);
  });

  it("403s a non-owner create", async () => {
    const res = await supertest(app)
      .post(`/api/campaigns/${campaignId}/items`)
      .set("Cookie", cookiePlayer)
      .send(weaponItem);
    expect(res.status).toBe(403);
  });

  it("owner list includes dmNotes; player list is 403", async () => {
    const ownerList = await supertest(app)
      .get(`/api/campaigns/${campaignId}/items`)
      .set("Cookie", cookieOwner);
    expect(ownerList.status).toBe(200);
    expect(ownerList.body.length).toBeGreaterThan(0);
    expect(ownerList.body[0].dmNotes).toBeDefined();

    const playerList = await supertest(app)
      .get(`/api/campaigns/${campaignId}/items`)
      .set("Cookie", cookiePlayer);
    expect(playerList.status).toBe(403);
  });

  it("clone-from-catalog shape: persists armor detail and all fields", async () => {
    const res = await supertest(app)
      .post(`/api/campaigns/${campaignId}/items`)
      .set("Cookie", cookieOwner)
      .send({
        name: "Dragon Plate",
        category: "armor",
        rarity: "legendary",
        requiresAttunement: false,
        weight: 65,
        cost: { gp: 10000 },
        armor: { armorCategory: "heavy", baseArmorClass: 20, stealthDisadvantage: true },
      });
    expect(res.status).toBe(201);
    expect(res.body.armor.baseArmorClass).toBe(20);
    expect(res.body.armor.armorCategory).toBe("heavy");
    expect(res.body.rarity).toBe("legendary");
  });

  it("renames the linked entity when the item is renamed", async () => {
    const created = await supertest(app)
      .post(`/api/campaigns/${campaignId}/items`)
      .set("Cookie", cookieOwner)
      .send({ name: "Old Name", category: "gear" });
    const entityId = created.body.entity.id as string;

    const res = await supertest(app)
      .patch(`/api/campaigns/${campaignId}/items/${created.body.id}`)
      .set("Cookie", cookieOwner)
      .send({ name: "New Name" });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("New Name");

    const entity = await prisma.campaignEntity.findUnique({ where: { id: entityId } });
    expect(entity?.name).toBe("New Name");
  });

  it("scrubs dmNotes from the player-facing by-entity payload and gates on reveal", async () => {
    const created = await supertest(app)
      .post(`/api/campaigns/${campaignId}/items`)
      .set("Cookie", cookieOwner)
      .send({ ...weaponItem, name: "Secret Blade" });
    const itemId = created.body.id as string;
    const entityId = created.body.entity.id as string;

    // Owner sees the full payload incl dmNotes.
    const ownerView = await supertest(app)
      .get(`/api/campaigns/${campaignId}/items/by-entity/${entityId}`)
      .set("Cookie", cookieOwner);
    expect(ownerView.status).toBe(200);
    expect(ownerView.body.dmNotes).toBe(weaponItem.dmNotes);

    // Player can't see it while the entity is HIDDEN.
    const hiddenView = await supertest(app)
      .get(`/api/campaigns/${campaignId}/items/by-entity/${entityId}`)
      .set("Cookie", cookiePlayer);
    expect(hiddenView.status).toBe(404);

    // Owner reveals the entity via the existing #379 machinery.
    await supertest(app)
      .patch(`/api/campaigns/${campaignId}/entities/${entityId}`)
      .set("Cookie", cookieOwner)
      .send({ visibility: "REVEALED" });

    const playerView = await supertest(app)
      .get(`/api/campaigns/${campaignId}/items/by-entity/${entityId}`)
      .set("Cookie", cookiePlayer);
    expect(playerView.status).toBe(200);
    expect(playerView.body.name).toBe("Secret Blade");
    expect(playerView.body.weapon).toBeDefined();
    // dmNotes must NEVER appear in a player-facing payload.
    expect("dmNotes" in playerView.body).toBe(false);

    // Cleanup so the delete test starts clean.
    await supertest(app).delete(`/api/campaigns/${campaignId}/items/${itemId}`).set("Cookie", cookieOwner);
  });

  it("deletes item + linked entity together (owner only)", async () => {
    const created = await supertest(app)
      .post(`/api/campaigns/${campaignId}/items`)
      .set("Cookie", cookieOwner)
      .send({ name: "Disposable Wand", category: "gear" });
    const itemId = created.body.id as string;
    const entityId = created.body.entity.id as string;

    const denied = await supertest(app)
      .delete(`/api/campaigns/${campaignId}/items/${itemId}`)
      .set("Cookie", cookiePlayer);
    expect(denied.status).toBe(403);

    const ok = await supertest(app)
      .delete(`/api/campaigns/${campaignId}/items/${itemId}`)
      .set("Cookie", cookieOwner);
    expect(ok.status).toBe(204);

    // The documented cleanup rule: deleting the item removes its fronting entity.
    expect(await prisma.campaignItem.findUnique({ where: { id: itemId } })).toBeNull();
    expect(await prisma.campaignEntity.findUnique({ where: { id: entityId } })).toBeNull();
  });

  it("404s updating an item that isn't in this campaign", async () => {
    const res = await supertest(app)
      .patch(`/api/campaigns/${campaignId}/items/00000000-0000-0000-0000-000000000000`)
      .set("Cookie", cookieOwner)
      .send({ name: "x" });
    expect(res.status).toBe(404);
  });
});
