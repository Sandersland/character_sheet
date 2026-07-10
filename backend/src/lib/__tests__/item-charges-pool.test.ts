import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Prisma } from "@/generated/prisma/client.js";
import { characterInclude } from "@/lib/character/character-include.js";
import { serializeCharacter } from "@/lib/character/character-serialize.js";
import { revertBatch } from "@/lib/activity.js";
import { applyHitPointOperations } from "@/lib/hitpoints.js";
import { applyInventoryOperations } from "@/lib/inventory/inventory.js";
import { applySpellcastingOperations } from "@/lib/spellcasting.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import type { SpellEntry } from "@/lib/spell-state.js";

const OWNER_ID = "owner-item-charges-pool";

const SPELL = {
  name: "Charges Pool Magic Missile",
  level: 1,
  school: "evocation" as const,
  castingTime: "1 action",
  range: "120 ft",
  duration: "Instantaneous",
  description: "Three glowing darts of magical force.",
  concentration: false,
  effectKind: "damage",
  effectDiceCount: 3,
  effectDiceFaces: 4,
  damageType: "force",
  classes: ["wizard"],
};

const BASE_CHAR = {
  name: "Wand Holder",
  alignment: "Neutral",
  experiencePoints: 0,
  initiativeBonus: 0,
  speed: 30,
  hitPoints: { current: 20, max: 20, temp: 0 },
  hitDice: { total: 2, die: "d8" },
  abilityScores: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
  savingThrowProficiencies: [],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
};

// Wand of Magic Missiles' pool: 7 charges, regains 1d6+1 daily at dawn.
const WAND_POOL = {
  kind: "charges" as const,
  maxCharges: 7,
  rechargeDiceCount: 1,
  rechargeDiceFaces: 6,
  rechargeBonus: 1,
  rechargeTrigger: "dawn" as const,
};

function chargesCast(spellId: string, over: Record<string, unknown> = {}) {
  return {
    kind: "castSpell" as const,
    spellId,
    spellName: "Magic Missile",
    spellLevel: 1,
    castLevel: 1,
    castResource: "charges" as const,
    chargeCost: 1,
    castConcentration: false,
    dcMode: "fixed" as const,
    attackMode: "fixed" as const,
    ...over,
  };
}

async function poolRow(itemId: string) {
  return prisma.inventoryCapability.findFirstOrThrow({ where: { inventoryItemId: itemId, kind: "charges" } });
}

async function entryIdFor(itemId: string, capabilityId: string): Promise<string> {
  const cap = await prisma.inventoryCapability.findUniqueOrThrow({ where: { id: capabilityId } });
  return `item:${itemId}:${cap.spellId}:${cap.id}`;
}

async function serialize(characterId: string) {
  const row = await prisma.character.findUniqueOrThrow({ where: { id: characterId }, include: characterInclude });
  return serializeCharacter(row);
}

describe("item charges pool (#555)", () => {
  let characterId: string;
  let spellId: string;

  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    const spell = await prisma.spell.upsert({ where: { name: SPELL.name }, create: SPELL, update: SPELL });
    spellId = spell.id;
    const character = await prisma.character.create({
      data: {
        ...BASE_CHAR,
        ownerId: OWNER_ID,
        spellcasting: Prisma.JsonNull,
        classEntries: { create: { name: "Fighter", level: 3, position: 0 } },
      },
    });
    characterId = character.id;
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { ownerId: OWNER_ID } });
    await prisma.spell.deleteMany({ where: { name: SPELL.name } });
  });

  async function makeWand(capabilities: Record<string, unknown>[], itemOver: Record<string, unknown> = {}) {
    const item = await prisma.inventoryItem.create({
      data: {
        character: { connect: { id: characterId } },
        name: "Wand of Magic Missiles",
        category: "gear",
        quantity: 1,
        requiresAttunement: true,
        attuned: true,
        ...itemOver,
        capabilities: { create: capabilities as Prisma.InventoryCapabilityCreateWithoutInventoryItemInput[] },
      },
      include: { capabilities: true },
    });
    return item;
  }

  it("a charges-costed cast spends the pool (not the capability's own counter)", async () => {
    const item = await makeWand([WAND_POOL, chargesCast(spellId, { chargeCost: 3 })]);
    const castCap = item.capabilities.find((c) => c.kind === "castSpell")!;
    const entryId = await entryIdFor(item.id, castCap.id);

    await applySpellcastingOperations(characterId, [{ type: "castItemSpell", entryId, roll: 9 }], OWNER_ID);

    expect((await poolRow(item.id)).used).toBe(3);
    const freshCastCap = await prisma.inventoryCapability.findUniqueOrThrow({ where: { id: castCap.id } });
    expect(freshCastCap.used).toBe(0); // the pool row carries the spend, not the cast row

    const ev = await prisma.characterEvent.findFirstOrThrow({ where: { characterId, type: "castSpell" } });
    const data = ev.data as Record<string, unknown>;
    expect(data.chargesSpent).toBe(3);
    expect(data.chargesRemaining).toBe(4);
    expect(data.poolCapabilityId).toBe((await poolRow(item.id)).id);
  });

  it("undo of a charges-costed cast refunds the pool (#580)", async () => {
    const item = await makeWand([WAND_POOL, chargesCast(spellId, { chargeCost: 3 })]);
    const castCap = item.capabilities.find((c) => c.kind === "castSpell")!;
    const entryId = await entryIdFor(item.id, castCap.id);

    await applySpellcastingOperations(characterId, [{ type: "castItemSpell", entryId, roll: 9 }], OWNER_ID);
    expect((await poolRow(item.id)).used).toBe(3);

    const ev = await prisma.characterEvent.findFirstOrThrow({ where: { characterId, type: "castSpell" } });
    const undone = await revertBatch(prisma, characterId, ev.batchId!);
    expect(undone.ok).toBe(true);
    expect((await poolRow(item.id)).used).toBe(0); // the 3 spent charges are refunded
  });

  it("blocks a cast whose cost exceeds the remaining charges", async () => {
    const item = await makeWand([
      WAND_POOL,
      chargesCast(spellId, { chargeCost: 3 }),
      chargesCast(spellId, { spellName: "Magic Missile (5th)", castLevel: 5, chargeCost: 5 }),
    ]);
    const [cheap, dear] = item.capabilities.filter((c) => c.kind === "castSpell");
    const cheapEntry = await entryIdFor(item.id, cheap.id);
    const dearEntry = await entryIdFor(item.id, dear.id);

    // 7 → 4 remaining; the 5-charge cast must be rejected and the pool untouched.
    await applySpellcastingOperations(characterId, [{ type: "castItemSpell", entryId: cheapEntry, roll: 9 }], OWNER_ID);
    await expect(
      applySpellcastingOperations(characterId, [{ type: "castItemSpell", entryId: dearEntry, roll: 9 }], OWNER_ID),
    ).rejects.toThrow(/needs 5 charges/i);
    expect((await poolRow(item.id)).used).toBe(3);

    // The cheap cast still works twice more (4 → 1 remaining), sharing the pool.
    await applySpellcastingOperations(characterId, [{ type: "castItemSpell", entryId: cheapEntry, roll: 9 }], OWNER_ID);
    expect((await poolRow(item.id)).used).toBe(6);
    await expect(
      applySpellcastingOperations(characterId, [{ type: "castItemSpell", entryId: cheapEntry, roll: 9 }], OWNER_ID),
    ).rejects.toThrow(/needs 3 charges/i);
  });

  it("a charges-costed activatedEffect spends the pool, not activatedUsesSpent, and undo restores it", async () => {
    const item = await makeWand([
      WAND_POOL,
      {
        kind: "activatedEffect",
        activation: "commandWord",
        target: "ac",
        op: "add",
        value: 1,
        activatedDuration: "whileActive",
        resourceKind: "charges",
        chargeCost: 2,
      },
    ]);

    await applyInventoryOperations(characterId, [{ type: "activate", inventoryItemId: item.id }]);
    expect((await poolRow(item.id)).used).toBe(2);
    const fresh = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(fresh.activatedUsesSpent).toBe(0);

    const ev = await prisma.characterEvent.findFirstOrThrow({ where: { characterId, type: "activated" } });
    expect(ev.summary).toContain("5 charges left");

    // LIFO undo of the activation restores the pool counter.
    const undone = await revertBatch(prisma, characterId, ev.batchId!);
    expect(undone.ok).toBe(true);
    expect((await poolRow(item.id)).used).toBe(0);
  });

  it("undo of an activation survives a delete/undo-delete cycle (capability ids changed)", async () => {
    // LIFO seam (PR #579 round-2): activate → remove item → undo remove
    // (recreates capability rows with NEW ids) → undo activate. The
    // capabilityUsed restore must no-op on the vanished old id (updateMany),
    // not throw RecordNotFound and fail the whole undo.
    const item = await makeWand([
      WAND_POOL,
      {
        kind: "activatedEffect",
        activation: "commandWord",
        target: "ac",
        op: "add",
        value: 1,
        activatedDuration: "whileActive",
        resourceKind: "charges",
        chargeCost: 2,
      },
    ]);
    await applyInventoryOperations(characterId, [{ type: "activate", inventoryItemId: item.id }]);
    const activateEv = await prisma.characterEvent.findFirstOrThrow({ where: { characterId, type: "activated" } });

    await applyInventoryOperations(characterId, [{ type: "remove", inventoryItemId: item.id }]);
    const removeEv = await prisma.characterEvent.findFirstOrThrow({ where: { characterId, type: "removed" } });

    // Undo the delete: the item is recreated from the snapshot — same item id,
    // NEW capability row ids, `used` restored from the snapshot (spent state kept).
    expect((await revertBatch(prisma, characterId, removeEv.batchId!)).ok).toBe(true);
    expect((await poolRow(item.id)).used).toBe(2);

    // Undo the activation: the old capability id no longer exists — must no-op, not fail.
    expect((await revertBatch(prisma, characterId, activateEv.batchId!)).ok).toBe(true);
  });

  it("blocks activation when the pool can't cover the cost", async () => {
    const item = await makeWand([
      { ...WAND_POOL, maxCharges: 1 },
      {
        kind: "activatedEffect",
        activation: "commandWord",
        target: "ac",
        op: "add",
        value: 1,
        activatedDuration: "whileActive",
        resourceKind: "charges",
        chargeCost: 2,
      },
    ]);
    await expect(applyInventoryOperations(characterId, [{ type: "activate", inventoryItemId: item.id }])).rejects.toThrow(
      /needs 2 charges/i,
    );
    expect((await poolRow(item.id)).used).toBe(0);
  });

  it("concurrent casts cannot overdraw the pool (atomic conditional spend)", async () => {
    // TOCTOU regression (PR #579 review): under READ COMMITTED, concurrent
    // transactions can each snapshot the same `used` and all pass the derived
    // remaining-check. The conditional increment (used <= max - cost) must let
    // exactly two cost-3 casts through a 7-charge pool, never pushing used past 7.
    const item = await makeWand([WAND_POOL, chargesCast(spellId, { chargeCost: 3 })]);
    const castCap = item.capabilities.find((c) => c.kind === "castSpell")!;
    const entryId = await entryIdFor(item.id, castCap.id);

    const results = await Promise.allSettled(
      Array.from({ length: 3 }, () =>
        applySpellcastingOperations(characterId, [{ type: "castItemSpell", entryId, roll: 9 }], OWNER_ID),
      ),
    );
    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    expect(succeeded).toBe(2); // 7 charges afford exactly two cost-3 casts
    const used = (await poolRow(item.id)).used;
    expect(used).toBe(6);
  });

  it("recharges 1d6+1 at dawn on a long rest (bounded, capped at max) and undo re-expends", async () => {
    const item = await makeWand([WAND_POOL, chargesCast(spellId)]);
    await prisma.inventoryCapability.updateMany({ where: { inventoryItemId: item.id, kind: "charges" }, data: { used: 7 } });

    await applyHitPointOperations(characterId, [{ type: "longRest" }]);
    const used = (await poolRow(item.id)).used;
    // Regained 1d6+1 ∈ [2,7] → used ∈ [0,5], never negative, never above max.
    expect(used).toBeGreaterThanOrEqual(0);
    expect(used).toBeLessThanOrEqual(5);

    const ev = await prisma.characterEvent.findFirstOrThrow({ where: { characterId, type: "longRest" } });
    expect(ev.summary).toContain("item charges recharged");
    expect((ev.before as Record<string, unknown>).chargePools).toBeTruthy();

    // Undoing the rest re-expends the pool to its pre-rest state.
    const undone = await revertBatch(prisma, characterId, ev.batchId!);
    expect(undone.ok).toBe(true);
    expect((await poolRow(item.id)).used).toBe(7);
  });

  it("a dice-less pool refills fully on its trigger", async () => {
    const item = await makeWand([
      { kind: "charges", maxCharges: 3, rechargeTrigger: "long" },
      chargesCast(spellId),
    ]);
    await prisma.inventoryCapability.updateMany({ where: { inventoryItemId: item.id, kind: "charges" }, data: { used: 3 } });
    await applyHitPointOperations(characterId, [{ type: "longRest" }]);
    expect((await poolRow(item.id)).used).toBe(0);
  });

  it("a short trigger recharges on a short rest; dawn does not", async () => {
    const shortItem = await makeWand([{ kind: "charges", maxCharges: 3, rechargeTrigger: "short" }, chargesCast(spellId)]);
    const dawnItem = await makeWand([WAND_POOL, chargesCast(spellId)], { name: "Dawn Wand" });
    await prisma.inventoryCapability.updateMany({
      where: { inventoryItemId: { in: [shortItem.id, dawnItem.id] }, kind: "charges" },
      data: { used: 3 },
    });

    await applyHitPointOperations(characterId, [{ type: "shortRest", rolls: [] }]);
    expect((await poolRow(shortItem.id)).used).toBe(0); // refilled (dice-less)
    expect((await poolRow(dawnItem.id)).used).toBe(3); // dawn waits for a long rest
  });

  it("recharges a pool on an item that is neither equipped nor attuned (wand in the bag)", async () => {
    const item = await makeWand([{ kind: "charges", maxCharges: 3, rechargeTrigger: "long" }, chargesCast(spellId)], {
      attuned: false,
    });
    await prisma.inventoryCapability.updateMany({ where: { inventoryItemId: item.id, kind: "charges" }, data: { used: 3 } });
    await applyHitPointOperations(characterId, [{ type: "longRest" }]);
    expect((await poolRow(item.id)).used).toBe(0);
  });

  it("serializes the pool pill state and pool-backed spell/activated readouts", async () => {
    const item = await makeWand([
      WAND_POOL,
      chargesCast(spellId, { chargeCost: 3 }),
      {
        kind: "activatedEffect",
        activation: "commandWord",
        target: "ac",
        op: "add",
        value: 1,
        activatedDuration: "whileActive",
        resourceKind: "charges",
        chargeCost: 2,
      },
    ]);
    await prisma.inventoryCapability.updateMany({ where: { inventoryItemId: item.id, kind: "charges" }, data: { used: 2 } });

    const sheet = await serialize(characterId);
    const wire = sheet.inventory.find((i) => i.id === item.id)!;
    expect(wire.charges).toEqual({ max: 7, remaining: 5, recharge: "regains 1d6+1 at dawn" });

    // The pool-backed spell mirrors the POOL's remaining/max + carries its cost.
    const sc = sheet.spellcasting as { spells?: SpellEntry[] } | undefined;
    const spell = sc?.spells?.find((s) => s.source === "item" && s.item?.inventoryItemId === item.id);
    expect(spell?.item).toMatchObject({ usesTotal: 7, usesRemaining: 5, chargeCost: 3 });

    // The activated readout floors remaining/cost: 5 remaining / cost 2 → 2 uses.
    expect(wire.activated).toMatchObject({ maxUses: 3, remainingUses: 2 });
  });

  it("unattuning hides the pool-backed spell but leaves the pool state intact", async () => {
    const item = await makeWand([WAND_POOL, chargesCast(spellId, { chargeCost: 3 })]);
    const castCap = item.capabilities.find((c) => c.kind === "castSpell")!;
    const entryId = await entryIdFor(item.id, castCap.id);
    await applySpellcastingOperations(characterId, [{ type: "castItemSpell", entryId, roll: 9 }], OWNER_ID);
    expect((await poolRow(item.id)).used).toBe(3);

    await applyInventoryOperations(characterId, [{ type: "unattune", inventoryItemId: item.id }]);
    expect((await poolRow(item.id)).used).toBe(3); // pool untouched
    const sheet = await serialize(characterId);
    // A non-caster with no remaining item spells has no spellcasting section at all.
    const sc = sheet.spellcasting as { spells?: SpellEntry[] } | undefined;
    expect(sc?.spells?.some((s) => s.item?.inventoryItemId === item.id) ?? false).toBe(false);

    // Re-attune: the spend state is exactly where it was left.
    await applyInventoryOperations(characterId, [{ type: "attune", inventoryItemId: item.id }]);
    const sc2 = (await serialize(characterId)).spellcasting as { spells?: SpellEntry[] } | undefined;
    const spell = sc2?.spells?.find((s) => s.item?.inventoryItemId === item.id);
    expect(spell?.item).toMatchObject({ usesRemaining: 4 });
  });
});
