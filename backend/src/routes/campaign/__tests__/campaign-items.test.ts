import { afterAll, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "@/app.js";
import { prisma } from "@/lib/core/prisma.js";
import { authCookie } from "@/test-support/auth.js";
import { ensureTestOwner } from "@/test-support/owner.js";

// Unique fixture ids for this file (parallel-safe on the shared dev DB).
const OWNER = "owner-campaign-items-owner";
const PLAYER = "owner-campaign-items-player";

const app = createApp();

const weaponItem = {
  name: "Flametongue",
  description: "A blade wreathed in fire.",
  category: "weapon" as const,
  rarity: "RARE" as const,
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
        rarity: "LEGENDARY",
        requiresAttunement: false,
        weight: 65,
        cost: { gp: 10000 },
        armor: { armorCategory: "heavy", baseArmorClass: 20, stealthDisadvantage: true },
      });
    expect(res.status).toBe(201);
    expect(res.body.armor.baseArmorClass).toBe(20);
    expect(res.body.armor.armorCategory).toBe("heavy");
    expect(res.body.rarity).toBe("LEGENDARY");
  });

  it("rejects a non-enum rarity with 400", async () => {
    const res = await supertest(app)
      .post(`/api/campaigns/${campaignId}/items`)
      .set("Cookie", cookieOwner)
      .send({ name: "Bad Rarity", category: "gear", rarity: "rare" });
    expect(res.status).toBe(400);
  });

  it("accepts null/omitted rarity as a mundane item", async () => {
    const omitted = await supertest(app)
      .post(`/api/campaigns/${campaignId}/items`)
      .set("Cookie", cookieOwner)
      .send({ name: "Mundane Rope", category: "gear" });
    expect(omitted.status).toBe(201);
    expect(omitted.body.rarity).toBeUndefined();

    const explicitNull = await supertest(app)
      .post(`/api/campaigns/${campaignId}/items`)
      .set("Cookie", cookieOwner)
      .send({ name: "Mundane Torch", category: "gear", rarity: null });
    expect(explicitNull.status).toBe(201);
    expect(explicitNull.body.rarity).toBeUndefined();
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

  // Boots of Speed: bonus action, +30 speed, once per long rest, until a long rest.
  const bootsCapability = {
    kind: "activatedEffect" as const,
    activation: "bonus" as const,
    target: "speed" as const,
    op: "add" as const,
    value: 30,
    activatedDuration: "untilRest" as const,
    resourceKind: "perRest" as const,
    resourcePeriod: "long" as const,
    resourceCharges: 1,
    durationText: "10 minutes",
  };

  it("authors an activatedEffect capability on create and serializes it (#543)", async () => {
    const res = await supertest(app)
      .post(`/api/campaigns/${campaignId}/items`)
      .set("Cookie", cookieOwner)
      .send({ name: "Boots of Speed", category: "gear", rarity: "RARE", requiresAttunement: true, capabilities: [bootsCapability] });
    expect(res.status).toBe(201);
    expect(res.body.capabilities).toHaveLength(1);
    expect(res.body.capabilities[0]).toMatchObject({
      kind: "activatedEffect",
      activation: "bonus",
      target: "speed",
      op: "add",
      value: 30,
      activatedDuration: "untilRest",
      resourceKind: "perRest",
      resourcePeriod: "long",
      resourceCharges: 1,
      durationText: "10 minutes",
    });

    const persisted = await prisma.campaignItemCapability.findMany({ where: { campaignItemId: res.body.id } });
    expect(persisted).toHaveLength(1);
    expect(persisted[0].activation).toBe("bonus");
  });

  it("replaces capabilities on PATCH (deleteMany + create, not merge)", async () => {
    const created = await supertest(app)
      .post(`/api/campaigns/${campaignId}/items`)
      .set("Cookie", cookieOwner)
      .send({ name: "Reauthored Boots", category: "gear", capabilities: [bootsCapability] });
    const itemId = created.body.id as string;

    const res = await supertest(app)
      .patch(`/api/campaigns/${campaignId}/items/${itemId}`)
      .set("Cookie", cookieOwner)
      .send({
        capabilities: [
          { kind: "passiveBonus", target: "skill", op: "add", value: 2, targetKey: "stealth" },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.capabilities).toHaveLength(1);
    expect(res.body.capabilities[0]).toMatchObject({ kind: "passiveBonus", target: "skill", value: 2, targetKey: "stealth" });

    // The old activatedEffect row is gone — replace, not merge.
    const persisted = await prisma.campaignItemCapability.findMany({ where: { campaignItemId: itemId } });
    expect(persisted).toHaveLength(1);
    expect(persisted[0].kind).toBe("passiveBonus");
  });

  // Wand of Magic Missiles' pool + a charges-costed cast (#555).
  const wandPool = {
    kind: "charges" as const,
    maxCharges: 7,
    recharge: { trigger: "dawn" as const, dice: { count: 1, faces: 6 }, bonus: 1 },
  };
  const chargesCast = {
    kind: "castSpell" as const,
    spellId: "spell-mm",
    spellName: "Magic Missile",
    spellLevel: 1,
    castLevel: 1,
    resource: "charges" as const,
    chargeCost: 1,
    dcMode: "fixed" as const,
    attackMode: "fixed" as const,
  };

  it("authors a charges pool + charges-costed castSpell and round-trips the editor shape (#555)", async () => {
    const res = await supertest(app)
      .post(`/api/campaigns/${campaignId}/items`)
      .set("Cookie", cookieOwner)
      .send({ name: "Wand of Magic Missiles", category: "gear", rarity: "UNCOMMON", capabilities: [wandPool, chargesCast] });
    expect(res.status).toBe(201);
    expect(res.body.capabilities).toHaveLength(2);
    // The serialized pool matches the input shape 1:1 (round-trips the DM editor).
    expect(res.body.capabilities[0]).toEqual({
      kind: "charges",
      maxCharges: 7,
      recharge: { trigger: "dawn", dice: { count: 1, faces: 6 }, bonus: 1 },
    });
    expect(res.body.capabilities[1]).toMatchObject({ kind: "castSpell", resource: "charges", chargeCost: 1 });

    const persisted = await prisma.campaignItemCapability.findMany({
      where: { campaignItemId: res.body.id },
      orderBy: { kind: "asc" },
    });
    const pool = persisted.find((c) => c.kind === "charges")!;
    expect(pool).toMatchObject({ maxCharges: 7, rechargeDiceCount: 1, rechargeDiceFaces: 6, rechargeBonus: 1, rechargeTrigger: "dawn" });
  });

  it("rejects two charges pools on one item with 400 (#555)", async () => {
    const res = await supertest(app)
      .post(`/api/campaigns/${campaignId}/items`)
      .set("Cookie", cookieOwner)
      .send({ name: "Two Pools", category: "gear", capabilities: [wandPool, { ...wandPool, maxCharges: 3 }] });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain("at most one charges pool");
  });

  it("rejects a charges-costed castSpell without a pool with 400 (#555)", async () => {
    const res = await supertest(app)
      .post(`/api/campaigns/${campaignId}/items`)
      .set("Cookie", cookieOwner)
      .send({ name: "Poolless Wand", category: "gear", capabilities: [chargesCast] });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain("requires a charges pool");
  });

  it("rejects a non-positive maxCharges with 400 (#555)", async () => {
    const res = await supertest(app)
      .post(`/api/campaigns/${campaignId}/items`)
      .set("Cookie", cookieOwner)
      .send({ name: "Empty Pool", category: "gear", capabilities: [{ ...wandPool, maxCharges: 0 }] });
    expect(res.status).toBe(400);
  });

  it("rejects an unknown capability field with 400 (strict schema)", async () => {
    const res = await supertest(app)
      .post(`/api/campaigns/${campaignId}/items`)
      .set("Cookie", cookieOwner)
      .send({ name: "Bad Cap", category: "gear", capabilities: [{ kind: "activatedEffect", bogus: true }] });
    expect(res.status).toBe(400);
  });

  it("rejects activatedEffect missing activation with 400 (superRefine)", async () => {
    const res = await supertest(app)
      .post(`/api/campaigns/${campaignId}/items`)
      .set("Cookie", cookieOwner)
      .send({
        name: "Incomplete Effect",
        category: "gear",
        capabilities: [{ kind: "activatedEffect", target: "speed", op: "add", value: 30 }],
      });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain("activation");
  });

  it("rejects activatedEffect with a non-add op with 400 (superRefine)", async () => {
    const res = await supertest(app)
      .post(`/api/campaigns/${campaignId}/items`)
      .set("Cookie", cookieOwner)
      .send({
        name: "SetTo Effect",
        category: "gear",
        capabilities: [
          { kind: "activatedEffect", activation: "bonus", target: "ac", op: "setTo", value: 1, resourceKind: "atWill" },
        ],
      });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain("op");
  });

  // ── Worn-slot authoring (#571) ──────────────────────────────────────────────

  it("DM-1: a gear item with a worn slot round-trips through create + PATCH", async () => {
    const created = await supertest(app)
      .post(`/api/campaigns/${campaignId}/items`)
      .set("Cookie", cookieOwner)
      .send({ name: "Circlet of Blasting", category: "gear", slot: "HEAD" });
    expect(created.status).toBe(201);
    expect(created.body.slot).toBe("HEAD");
    const itemId = created.body.id as string;
    const entityId = created.body.entity.id as string;

    const fetched = await supertest(app)
      .get(`/api/campaigns/${campaignId}/items/by-entity/${entityId}`)
      .set("Cookie", cookieOwner);
    expect(fetched.body.slot).toBe("HEAD");

    const patched = await supertest(app)
      .patch(`/api/campaigns/${campaignId}/items/${itemId}`)
      .set("Cookie", cookieOwner)
      .send({ slot: "NECK" });
    expect(patched.status).toBe(200);
    expect(patched.body.slot).toBe("NECK");
  });

  it("DM-2: slot is optional — a gear item without one saves with slot = null", async () => {
    const res = await supertest(app)
      .post(`/api/campaigns/${campaignId}/items`)
      .set("Cookie", cookieOwner)
      .send({ name: "Loose Marble", category: "gear" });
    expect(res.status).toBe(201);
    expect(res.body.slot).toBeUndefined();

    const persisted = await prisma.campaignItem.findUnique({ where: { id: res.body.id } });
    expect(persisted?.slot).toBeNull();
  });

  it("DM-5: a slot on a non-gear item is rejected 400, naming the field", async () => {
    const res = await supertest(app)
      .post(`/api/campaigns/${campaignId}/items`)
      .set("Cookie", cookieOwner)
      .send({
        name: "Slotted Sword",
        category: "weapon",
        slot: "HEAD",
        weapon: { damageDiceCount: 1, damageDiceFaces: 8, damageType: "slashing" },
      });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain("slot");
  });

  it("DM-5: a non-worn slot (MAIN_HAND/OFF_HAND/BODY) on gear is rejected 400", async () => {
    for (const slot of ["MAIN_HAND", "OFF_HAND", "BODY"]) {
      const res = await supertest(app)
        .post(`/api/campaigns/${campaignId}/items`)
        .set("Cookie", cookieOwner)
        .send({ name: `Bad Slot ${slot}`, category: "gear", slot });
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toContain("slot");
    }
  });

  it("DM-5: a PATCH that sets slot on an existing weapon (without resending category) is rejected 400", async () => {
    const created = await supertest(app)
      .post(`/api/campaigns/${campaignId}/items`)
      .set("Cookie", cookieOwner)
      .send({
        name: "Plain Sword",
        category: "weapon",
        weapon: { damageDiceCount: 1, damageDiceFaces: 8, damageType: "slashing" },
      });
    const itemId = created.body.id as string;
    // The schema-level refine can't see the existing category on a category-less PATCH;
    // the handler's effective-category guard must still reject the slot.
    const res = await supertest(app)
      .patch(`/api/campaigns/${campaignId}/items/${itemId}`)
      .set("Cookie", cookieOwner)
      .send({ slot: "NECK" });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain("slot");
    const after = await prisma.campaignItem.findUnique({ where: { id: itemId } });
    expect(after?.slot).toBeNull();
  });

  it("DM-4: updating a gear item's category to weapon clears its slot", async () => {
    const created = await supertest(app)
      .post(`/api/campaigns/${campaignId}/items`)
      .set("Cookie", cookieOwner)
      .send({ name: "Shifting Trinket", category: "gear", slot: "BELT" });
    expect(created.body.slot).toBe("BELT");
    const itemId = created.body.id as string;

    const patched = await supertest(app)
      .patch(`/api/campaigns/${campaignId}/items/${itemId}`)
      .set("Cookie", cookieOwner)
      .send({ category: "weapon", weapon: { damageDiceCount: 1, damageDiceFaces: 6, damageType: "bludgeoning" } });
    expect(patched.status).toBe(200);
    expect(patched.body.slot).toBeUndefined();

    const persisted = await prisma.campaignItem.findUnique({ where: { id: itemId } });
    expect(persisted?.slot).toBeNull();
  });

  it("PATCH replaces capabilities preserving dice fields via capabilityCreate (#543)", async () => {
    const diceCapability = {
      kind: "passiveBonus" as const,
      target: "damage" as const,
      op: "add" as const,
      value: 0,
      dice: { count: 1, faces: 6 },
    };
    const created = await supertest(app)
      .post(`/api/campaigns/${campaignId}/items`)
      .set("Cookie", cookieOwner)
      .send({ name: "Flametongue", category: "weapon", capabilities: [] });
    const itemId = created.body.id as string;

    const res = await supertest(app)
      .patch(`/api/campaigns/${campaignId}/items/${itemId}`)
      .set("Cookie", cookieOwner)
      .send({ capabilities: [diceCapability] });
    expect(res.status).toBe(200);
    expect(res.body.capabilities[0]).toMatchObject({ kind: "passiveBonus", target: "damage" });

    const persisted = await prisma.campaignItemCapability.findMany({ where: { campaignItemId: itemId } });
    expect(persisted[0].valueDiceCount).toBe(1);
    expect(persisted[0].valueDiceFaces).toBe(6);
  });

  // #686 gap pins: the CRUD branches the created/updated/serializeCampaignItem
  // decomposition most endangers, unpinned above — consumables (zero coverage),
  // the PATCH detail-upsert branches, capabilities:[] clearing, the entity
  // name-sync negative, and category-change detail retention. Characterization:
  // these pin CURRENT behavior. Green before the refactor; unedited through it.
  describe("create/update/serialize gap pins (#686)", () => {
    async function createItem(body: object) {
      return supertest(app).post(`/api/campaigns/${campaignId}/items`).set("Cookie", cookieOwner).send(body);
    }
    async function patchItem(itemId: string, body: object) {
      return supertest(app).patch(`/api/campaigns/${campaignId}/items/${itemId}`).set("Cookie", cookieOwner).send(body);
    }

    it("consumable create round-trips every detail field", async () => {
      const res = await createItem({
        name: "Greater Healing Potion (686)",
        description: "Restores health.",
        category: "consumable",
        consumable: { effectDiceCount: 4, effectDiceFaces: 4, effectModifier: 4, effectDescription: "Regain 4d4+4 HP" },
      });
      expect(res.status).toBe(201);
      expect(res.body.consumable).toEqual({
        effectDiceCount: 4,
        effectDiceFaces: 4,
        effectModifier: 4,
        effectDescription: "Regain 4d4+4 HP",
      });
    });

    it("consumable PATCH exercises the detail upsert-update branch", async () => {
      const created = await createItem({
        name: "Weak Potion (686)",
        category: "consumable",
        consumable: { effectDiceCount: 2, effectDiceFaces: 4, effectDescription: "Regain 2d4 HP" },
      });
      const itemId = created.body.id as string;

      const patched = await patchItem(itemId, {
        consumable: { effectDiceCount: 2, effectDiceFaces: 4, effectModifier: 2, effectDescription: "Regain 2d4+2 HP" },
      });
      expect(patched.status).toBe(200);
      expect(patched.body.consumable).toEqual({
        effectDiceCount: 2,
        effectDiceFaces: 4,
        effectModifier: 2,
        effectDescription: "Regain 2d4+2 HP",
      });
    });

    it("weapon PATCH round-trips the full detail field set (upsert-update branch)", async () => {
      const created = await createItem({
        name: "Adjustable Spear (686)",
        category: "weapon",
        weapon: { damageDiceCount: 1, damageDiceFaces: 6, damageType: "piercing" },
      });
      const itemId = created.body.id as string;

      const fullWeapon = {
        damageDiceCount: 1,
        damageDiceFaces: 8,
        damageModifier: 1,
        damageType: "piercing",
        versatileDiceCount: 1,
        versatileDiceFaces: 10,
        finesse: false,
        light: false,
        heavy: true,
        twoHanded: false,
        reach: true,
        thrown: true,
        ammunition: false,
        rangeNormal: 20,
        rangeLong: 60,
        weaponClass: "martial" as const,
        weaponRange: "melee" as const,
      };
      const patched = await patchItem(itemId, { weapon: fullWeapon });
      expect(patched.status).toBe(200);
      expect(patched.body.weapon).toEqual(fullWeapon);
    });

    it("armor PATCH round-trips the full detail field set (upsert-update branch)", async () => {
      const created = await createItem({
        name: "Adjustable Plate (686)",
        category: "armor",
        armor: { armorCategory: "heavy", baseArmorClass: 16 },
      });
      const itemId = created.body.id as string;

      const patched = await patchItem(itemId, {
        armor: {
          armorCategory: "medium",
          baseArmorClass: 14,
          dexModifierApplies: true,
          dexModifierMax: 2,
          stealthDisadvantage: true,
          strengthRequirement: 13,
        },
      });
      expect(patched.status).toBe(200);
      expect(patched.body.armor).toEqual({
        armorCategory: "medium",
        baseArmorClass: 14,
        dexModifierApplies: true,
        dexModifierMax: 2,
        stealthDisadvantage: true,
        strengthRequirement: 13,
      });
    });

    it("PATCH with a detail block on an item created without one exercises upsert-create", async () => {
      // detailCreate only nests a detail when the CREATE carries the block;
      // patching one in later must hit the upsert's create arm.
      const created = await createItem({ name: "Blank Blade (686)", category: "weapon" });
      const itemId = created.body.id as string;
      expect(created.body.weapon).toBeUndefined();

      const patched = await patchItem(itemId, {
        weapon: { damageDiceCount: 2, damageDiceFaces: 6, damageType: "slashing" },
      });
      expect(patched.status).toBe(200);
      expect(patched.body.weapon).toMatchObject({ damageDiceCount: 2, damageDiceFaces: 6, damageType: "slashing" });
    });

    it("PATCH capabilities: [] clears an existing populated set (replace semantics)", async () => {
      const created = await createItem({
        name: "Fading Charm (686)",
        category: "gear",
        capabilities: [{ kind: "passiveBonus", target: "initiative", op: "add", value: 1 }],
      });
      const itemId = created.body.id as string;
      expect(created.body.capabilities).toHaveLength(1);

      const patched = await patchItem(itemId, { capabilities: [] });
      expect(patched.status).toBe(200);
      expect(patched.body.capabilities).toBeUndefined();
      expect(await prisma.campaignItemCapability.count({ where: { campaignItemId: itemId } })).toBe(0);
    });

    it("PATCH without a name does NOT touch the linked entity (name-sync negative)", async () => {
      const created = await createItem({ name: "Stable Name (686)", category: "gear" });
      const itemId = created.body.id as string;
      const entityId = created.body.entity.id as string;
      const before = await prisma.campaignEntity.findUniqueOrThrow({ where: { id: entityId } });

      const patched = await patchItem(itemId, { description: "New description only." });
      expect(patched.status).toBe(200);

      const after = await prisma.campaignEntity.findUniqueOrThrow({ where: { id: entityId } });
      expect(after.name).toBe("Stable Name (686)");
      expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
    });

    it("category change away from weapon KEEPS the stale weapon detail (current behavior)", async () => {
      // Characterization, not endorsement: the PATCH clears `slot` on
      // category change but leaves the old detail row in place, and the
      // serializer keeps emitting it. If the refactor is ever meant to fix
      // this, do it deliberately — not as a silent side-effect.
      const created = await createItem({
        name: "Sword-turned-Trinket (686)",
        category: "weapon",
        weapon: { damageDiceCount: 1, damageDiceFaces: 8, damageType: "slashing" },
      });
      const itemId = created.body.id as string;

      const patched = await patchItem(itemId, { category: "gear" });
      expect(patched.status).toBe(200);
      expect(patched.body.category).toBe("gear");
      expect(patched.body.weapon).toMatchObject({ damageDiceCount: 1, damageDiceFaces: 8 });

      const detail = await prisma.campaignItemWeaponDetail.findUnique({ where: { campaignItemId: itemId } });
      expect(detail).not.toBeNull();
    });
  });
});
