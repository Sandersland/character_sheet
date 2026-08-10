/**
 * Buff-end suspended-condition restore (#1121) — the chokepoint invariant:
 * EVERY path that ends a buff restores any condition suspended against it
 * (2014 Mindless Rage, PHB'14 p.49), because the restore lives inside
 * buff-end.ts's shared clear core, not at call sites. Exercises each caller
 * family the re-review flagged as dropping the clear's return value: the
 * direct key-clear (inventory deactivate/remove/sell/unattune, Quivering
 * Palm), the spellcasting dismiss op, the rest sweep (until-rest buffs), the
 * inventory unequip op, and the concentration-end sweep — plus the restore's
 * own immunity re-check (a condition still blocked by ANOTHER active buff's
 * conditionImmunities stays suspended until that buff ends too). The
 * voluntary-toggle and HP->0/long-rest rage paths live in
 * actions-rage-mindless.test.ts. Requires DATABASE_URL (docker compose up db).
 */

import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/core/prisma.js";
import { Prisma } from "@/generated/prisma/client.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { normalizeActiveEffectsMutable, type ActiveBuff } from "@/lib/combat/active-effects.js";
import { clearBuffByKeyInTx, clearBuffsForSourceInTx } from "@/lib/combat/buff-end.js";
import { normalizeConditionsMutable } from "@/lib/combat/conditions.js";
import { applyHitPointOperations } from "@/lib/combat/hitpoints.js";
import { applySpellcastingOperations } from "@/lib/spellcasting/spellcasting.js";
import { applyInventoryOperations } from "@/lib/inventory/inventory.js";
import { itemBuffKey } from "@/lib/inventory/inventory-types.js";
import { inventoryItemFixtureData } from "@/test-support/inventory-snapshot-fixture.js";

const OWNER_ID = "owner-buff-end-restore";
const FIXTURE_ID = "test-buff-end-restore-character-1";

type BuffSeed = Omit<ActiveBuff, "id">;

interface SuspendedSeed {
  key: string;
  gatingBuffKey: string;
  source?: string;
}

async function seedState(buffs: BuffSeed[], suspended: SuspendedSeed[]) {
  await prisma.character.update({
    where: { id: FIXTURE_ID },
    data: {
      activeEffects: { buffs: buffs.map((b) => ({ id: randomUUID(), ...b })) } as unknown as Prisma.InputJsonValue,
      conditions: {
        active: [],
        exhaustion: 0,
        suspended: suspended.map((s) => ({
          key: s.key,
          source: s.source ?? null,
          appliedAt: new Date().toISOString(),
          gatingBuffKey: s.gatingBuffKey,
        })),
      } as unknown as Prisma.InputJsonValue,
    },
  });
}

async function readState() {
  const row = await prisma.character.findUniqueOrThrow({
    where: { id: FIXTURE_ID },
    select: { conditions: true, activeEffects: true },
  });
  const conditions = normalizeConditionsMutable(row.conditions);
  return {
    active: conditions.active.map((e) => e.key),
    suspended: conditions.suspended.map((e) => e.key),
    buffs: normalizeActiveEffectsMutable(row.activeEffects).buffs.map((b) => b.key),
  };
}

const WARD: BuffSeed = { key: "ward", target: "athletics", modifier: 1, source: "Test Ward", duration: "while-active" };

describe("buff-end restores suspended conditions on every clearing path (#1121)", () => {
  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    await prisma.character.create({
      data: {
        id: FIXTURE_ID,
        name: "Buff End Restore Fixture",
        alignment: "Neutral",
        ownerId: OWNER_ID,
        experiencePoints: 0,
        initiativeBonus: 0,
        speed: 30,
        hitPoints: { current: 20, max: 20, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        hitDice: { total: 3, die: "d8", spent: 0 },
        abilityScores: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
        savingThrowProficiencies: [],
        skills: [],
        toolProficiencies: [],
        currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
      },
    });
  });

  afterEach(async () => {
    await prisma.characterEvent.deleteMany({ where: { characterId: FIXTURE_ID } });
    await prisma.character.deleteMany({ where: { id: FIXTURE_ID } });
  });

  it("clearBuffByKeyInTx (the chokepoint every direct key-clear caller shares) restores on clear", async () => {
    await seedState([WARD], [{ key: "charmed", gatingBuffKey: "ward" }]);
    await prisma.$transaction((tx) => clearBuffByKeyInTx(tx, FIXTURE_ID, "ward", randomUUID(), null, "test"));
    expect(await readState()).toEqual({ active: ["charmed"], suspended: [], buffs: [] });
  });

  it("dismissing a buff via the spellcasting dismissBuff op restores", async () => {
    await seedState([WARD], [{ key: "charmed", gatingBuffKey: "ward" }]);
    await applySpellcastingOperations(FIXTURE_ID, [{ type: "dismissBuff", entryId: "ward" }], OWNER_ID);
    expect(await readState()).toEqual({ active: ["charmed"], suspended: [], buffs: [] });
  });

  it("a long rest clearing an until-rest buff restores (clearBuffsForRestInTx path)", async () => {
    await seedState(
      [{ ...WARD, duration: "until-rest", restType: "long" }],
      [{ key: "frightened", gatingBuffKey: "ward" }],
    );
    await applyHitPointOperations(FIXTURE_ID, [{ type: "longRest" }]);
    expect(await readState()).toEqual({ active: ["frightened"], suspended: [], buffs: [] });
  });

  it("unequipping an item whose buff ends restores (inventory setEquipped path)", async () => {
    const item = await prisma.inventoryItem.create({
      data: inventoryItemFixtureData({
        characterId: FIXTURE_ID,
        name: "Circlet of Calm",
        category: "gear",
        equippedSlot: "HEAD",
      }),
    });
    await seedState(
      [{ ...WARD, key: itemBuffKey(item.id) }],
      [{ key: "charmed", gatingBuffKey: itemBuffKey(item.id) }],
    );
    await applyInventoryOperations(FIXTURE_ID, [{ type: "setEquipped", inventoryItemId: item.id, equipped: false }]);
    expect(await readState()).toEqual({ active: ["charmed"], suspended: [], buffs: [] });
  });

  it("a concentration end restores (clearBuffsForSourceInTx path)", async () => {
    await seedState(
      [{ ...WARD, duration: "concentration", sourceEntryId: "e1" }],
      [{ key: "charmed", gatingBuffKey: "ward" }],
    );
    await prisma.$transaction((tx) => clearBuffsForSourceInTx(tx, FIXTURE_ID, "e1", randomUUID(), null, "removal"));
    expect(await readState()).toEqual({ active: ["charmed"], suspended: [], buffs: [] });
  });

  it("a condition still immune through ANOTHER active buff stays suspended, and restores when that buff ends too", async () => {
    await seedState(
      [WARD, { ...WARD, key: "aegis", source: "Test Aegis", conditionImmunities: ["charmed"] }],
      [{ key: "charmed", gatingBuffKey: "ward" }],
    );

    // Ending the gating buff must NOT restore: the aegis buff still grants
    // charmed immunity, and restoring would recreate the exact state the
    // write-guard blocks (#1121 re-review finding: restore bypassed the
    // immunity check).
    await prisma.$transaction((tx) => clearBuffByKeyInTx(tx, FIXTURE_ID, "ward", randomUUID(), null, "test"));
    expect(await readState()).toEqual({ active: [], suspended: ["charmed"], buffs: ["aegis"] });

    // Ending the still-immune buff re-runs the restore — now unblocked.
    await prisma.$transaction((tx) => clearBuffByKeyInTx(tx, FIXTURE_ID, "aegis", randomUUID(), null, "test"));
    expect(await readState()).toEqual({ active: ["charmed"], suspended: [], buffs: [] });
  });
});
