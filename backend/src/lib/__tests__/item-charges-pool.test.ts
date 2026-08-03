import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Prisma } from "@/generated/prisma/client.js";
import { characterInclude } from "@/lib/character/character-include.js";
import { serializeCharacter } from "@/lib/character/character-serialize.js";
import { revertBatch } from "@/lib/activity/activity.js";
import { applyHitPointOperations } from "@/lib/combat/hitpoints.js";
import { applyInventoryOperations } from "@/lib/inventory/inventory.js";
import { applySpellcastingOperations } from "@/lib/spellcasting/spellcasting.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import type { SpellEntry } from "@/lib/spellcasting/spell-state.js";
import type { CapabilityColumns } from "@/lib/inventory/capabilities.js";
import { readInventorySnapshot } from "@/lib/inventory/inventory-snapshot-read.js";
import { inventoryItemFixtureData, type InventoryItemFixtureInput } from "@/test-support/inventory-snapshot-fixture.js";

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
const WAND_POOL: CapabilityColumns = {
  kind: "charges",
  maxCharges: 7,
  rechargeDiceCount: 1,
  rechargeDiceFaces: 6,
  rechargeBonus: 1,
  rechargeTrigger: "dawn",
};

function chargesCast(
  spellId: string,
  over: Partial<CapabilityColumns> & { id?: string } = {},
): CapabilityColumns & { id?: string } {
  return {
    kind: "castSpell",
    spellId,
    spellName: "Magic Missile",
    spellLevel: 1,
    castLevel: 1,
    castResource: "charges",
    chargeCost: 1,
    castConcentration: false,
    dcMode: "fixed",
    attackMode: "fixed",
    ...over,
  };
}

// The item's charges-pool capability key, read off its snapshot (#1649) —
// dynamic lookup, not a pre-known id, since a pool never needs to be
// referenced by an entryId the way a castSpell capability does.
async function poolCapabilityKey(itemId: string): Promise<string> {
  const item = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: itemId } });
  const pool = readInventorySnapshot(item).capabilities.find((c) => c.kind === "charges");
  if (!pool) throw new Error(`item ${itemId} has no charges pool capability`);
  return pool.key;
}

async function poolRow(itemId: string): Promise<{ id: string; used: number }> {
  const id = await poolCapabilityKey(itemId);
  const use = await prisma.inventoryCapabilityUse.findFirstOrThrow({ where: { capabilityKey: id } });
  return { id, used: use.used };
}

// Test-only backdoor to seed a pool's starting `used` state (simulating prior
// spend) without going through a real cast/activation.
async function setPoolUsed(itemId: string, used: number): Promise<void> {
  const id = await poolCapabilityKey(itemId);
  await prisma.inventoryCapabilityUse.updateMany({ where: { capabilityKey: id }, data: { used } });
}

async function entryIdFor(itemId: string, capabilityId: string): Promise<string> {
  const item = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: itemId } });
  const cap = readInventorySnapshot(item).capabilities.find((c) => c.key === capabilityId);
  if (!cap || cap.kind !== "castSpell") throw new Error(`capability ${capabilityId} on item ${itemId} is not a castSpell`);
  return `item:${itemId}:${cap.spellId}:${cap.key}`;
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

  async function makeWand(
    capabilities: (CapabilityColumns & { id?: string; used?: number })[],
    itemOver: Partial<InventoryItemFixtureInput> = {},
  ) {
    return prisma.inventoryItem.create({
      data: inventoryItemFixtureData({
        characterId,
        name: "Wand of Magic Missiles",
        category: "gear",
        requiresAttunement: true,
        attuned: true,
        ...itemOver,
        capabilities,
      }),
    });
  }

  it("a charges-costed cast spends the pool (not the capability's own counter)", async () => {
    const castCapId = randomUUID();
    const item = await makeWand([WAND_POOL, chargesCast(spellId, { chargeCost: 3, id: castCapId })]);
    const entryId = await entryIdFor(item.id, castCapId);

    await applySpellcastingOperations(characterId, [{ type: "castItemSpell", entryId, roll: 9 }], OWNER_ID);

    expect((await poolRow(item.id)).used).toBe(3);
    const use = await prisma.inventoryCapabilityUse.findFirstOrThrow({ where: { capabilityKey: castCapId } });
    expect(use.used).toBe(0); // the pool row carries the spend, not the cast row

    const ev = await prisma.characterEvent.findFirstOrThrow({ where: { characterId, type: "castSpell" } });
    const data = ev.data as Record<string, unknown>;
    expect(data.chargesSpent).toBe(3);
    expect(data.chargesRemaining).toBe(4);
    expect(data.poolCapabilityId).toBe((await poolRow(item.id)).id);
  });

  it("undo of a charges-costed cast refunds the pool (#580)", async () => {
    const castCapId = randomUUID();
    const item = await makeWand([WAND_POOL, chargesCast(spellId, { chargeCost: 3, id: castCapId })]);
    const entryId = await entryIdFor(item.id, castCapId);

    await applySpellcastingOperations(characterId, [{ type: "castItemSpell", entryId, roll: 9 }], OWNER_ID);
    expect((await poolRow(item.id)).used).toBe(3);

    const ev = await prisma.characterEvent.findFirstOrThrow({ where: { characterId, type: "castSpell" } });
    const undone = await revertBatch(prisma, characterId, ev.batchId!);
    expect(undone.ok).toBe(true);
    expect((await poolRow(item.id)).used).toBe(0); // the 3 spent charges are refunded
  });

  it("blocks a cast whose cost exceeds the remaining charges", async () => {
    const cheapId = randomUUID();
    const dearId = randomUUID();
    const item = await makeWand([
      WAND_POOL,
      chargesCast(spellId, { chargeCost: 3, id: cheapId }),
      chargesCast(spellId, { spellName: "Magic Missile (5th)", castLevel: 5, chargeCost: 5, id: dearId }),
    ]);
    const cheapEntry = await entryIdFor(item.id, cheapId);
    const dearEntry = await entryIdFor(item.id, dearId);

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
    const castCapId = randomUUID();
    const item = await makeWand([WAND_POOL, chargesCast(spellId, { chargeCost: 3, id: castCapId })]);
    const entryId = await entryIdFor(item.id, castCapId);

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
    await setPoolUsed(item.id, 7);

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
    await setPoolUsed(item.id, 3);
    await applyHitPointOperations(characterId, [{ type: "longRest" }]);
    expect((await poolRow(item.id)).used).toBe(0);
  });

  it("a short trigger recharges on a short rest; dawn does not", async () => {
    const shortItem = await makeWand([{ kind: "charges", maxCharges: 3, rechargeTrigger: "short" }, chargesCast(spellId)]);
    const dawnItem = await makeWand([WAND_POOL, chargesCast(spellId)], { name: "Dawn Wand" });
    await setPoolUsed(shortItem.id, 3);
    await setPoolUsed(dawnItem.id, 3);

    await applyHitPointOperations(characterId, [{ type: "shortRest", rolls: [] }]);
    expect((await poolRow(shortItem.id)).used).toBe(0); // refilled (dice-less)
    expect((await poolRow(dawnItem.id)).used).toBe(3); // dawn waits for a long rest
  });

  it("recharges a pool on an item that is neither equipped nor attuned (wand in the bag)", async () => {
    const item = await makeWand([{ kind: "charges", maxCharges: 3, rechargeTrigger: "long" }, chargesCast(spellId)], {
      attuned: false,
    });
    await setPoolUsed(item.id, 3);
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
    await setPoolUsed(item.id, 2);

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
    const castCapId = randomUUID();
    const item = await makeWand([WAND_POOL, chargesCast(spellId, { chargeCost: 3, id: castCapId })]);
    const entryId = await entryIdFor(item.id, castCapId);
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
