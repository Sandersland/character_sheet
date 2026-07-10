/**
 * DB-backed tests for castAbilityInTx.
 *
 * castAbilityInTx pays a cost, formats the summary, drops/sets concentration,
 * and applies a self-effect — some branches log events and touch HP, so a real
 * Postgres transaction is needed. Styled after ability-cost-pool.test.ts.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { castAbilityInTx } from "@/lib/spellcasting/ability-cast.js";
import type { EffectSpec } from "@/lib/combat/effects.js";
import type { PayCostContext } from "@/lib/spellcasting/ability-cost.js";
import type { SpellcastingMutableState } from "@/lib/spellcasting/spell-state.js";

const OWNER_ID = "owner-ability-cast";

const CHAR = {
  name: "Ability Cast Test Caster",
  alignment: "Neutral Good",
  experiencePoints: 6500, // level 5
  initiativeBonus: 0,
  speed: 30,
  hitPoints: { current: 20, max: 20, temp: 0 },
  hitDice: { total: 5, die: "d6" },
  abilityScores: { strength: 10, dexterity: 12, constitution: 12, intelligence: 16, wisdom: 10, charisma: 10 },
  savingThrowProficiencies: ["intelligence", "wisdom"],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
};

const DAMAGE_FIRE: EffectSpec = { effectType: "damage", damageType: "fire", scaling: { mode: "none" } };
const HEAL: EffectSpec = { effectType: "heal", scaling: { mode: "none" } };

function bareHost(concentratingOn: SpellcastingMutableState["concentratingOn"] = null): SpellcastingMutableState {
  return { slotsUsed: {}, arcanumUsed: {}, spells: [], concentratingOn };
}

// tx is `undefined as never` — slot/none paths never touch it. A write-path test must override tx.
function slotCostCtx(overrides: Partial<PayCostContext> = {}): PayCostContext {
  return {
    tx: undefined as never,
    characterId: "unused",
    batchId: "batch-1",
    sessionId: null,
    slotsUsed: {},
    arcanumUsed: {},
    slotTotals: { 1: 2 },
    arcanaTotals: {},
    ...overrides,
  };
}

describe("castAbilityInTx (DB-backed)", () => {
  let characterId: string;

  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    const character = await prisma.character.create({
      data: {
        ...CHAR,
        ownerId: OWNER_ID,
        spellcasting: Prisma.JsonNull,
        resources: Prisma.JsonNull,
        classEntries: { create: [{ name: "wizard", position: 0 }] },
      },
    });
    characterId = character.id;
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: characterId } });
  });

  it("slot + damage: spends the slot, formats summary + eventData.slotLevel", async () => {
    const cost = slotCostCtx();
    const outcome = await prisma.$transaction((tx) =>
      castAbilityInTx(
        { tx, characterId, batchId: "batch-1", sessionId: null, cost, concentrationHost: bareHost() },
        { name: "Firebolt", entryId: "e-1", cost: { kind: "slot", minLevel: 1 }, effect: DAMAGE_FIRE,
          requested: 1, roll: 9, eventType: "castSpell", concentrates: false },
      )
    );

    expect(outcome).toEqual({
      eventType: "castSpell",
      summary: "Cast Firebolt (L1 slot): 9 fire damage",
      eventData: { entryId: "e-1", spellName: "Firebolt", roll: 9, slotLevel: 1 },
    });
    expect(cost.slotsUsed!["1"]).toBe(1);
  });

  it("none cost (cantrip): no parens, slotLevel null", async () => {
    const cost = slotCostCtx();
    const outcome = await prisma.$transaction((tx) =>
      castAbilityInTx(
        { tx, characterId, batchId: "batch-1", sessionId: null, cost, concentrationHost: bareHost() },
        { name: "Fire Bolt", entryId: "c-1", cost: { kind: "none" }, effect: DAMAGE_FIRE,
          roll: 7, eventType: "castSpell", concentrates: false },
      )
    );

    expect(outcome).toEqual({
      eventType: "castSpell",
      summary: "Cast Fire Bolt: 7 fire damage",
      eventData: { entryId: "c-1", spellName: "Fire Bolt", roll: 7, slotLevel: null },
    });
    expect(cost.slotsUsed!["1"]).toBeUndefined();
  });

  it("concentration displace on a BARE host (no spells[]): logs drop + sets new", async () => {
    const host = bareHost({ entryId: "old-entry", spellName: "Old Spell" });
    const cost = slotCostCtx({ characterId, tx: undefined as never });

    await prisma.$transaction((tx) =>
      castAbilityInTx(
        { tx, characterId, batchId: "batch-conc", sessionId: null, cost: { ...cost, tx, characterId }, concentrationHost: host },
        { name: "New Spell", entryId: "new-entry", cost: { kind: "slot", minLevel: 1 }, effect: HEAL,
          requested: 1, roll: 0, eventType: "castSpell", concentrates: true },
      )
    );

    expect(host.concentratingOn).toEqual({ entryId: "new-entry", spellName: "New Spell" });

    const drops = await prisma.characterEvent.findMany({
      where: { characterId, type: "concentrationDropped" },
    });
    expect(drops).toHaveLength(1);
    expect(drops[0].summary).toBe("Concentration on Old Spell dropped (cast New Spell)");
    expect(drops[0].data).toEqual({
      droppedEntryId: "old-entry", droppedSpellName: "Old Spell", reason: "newCast", castEntryId: "new-entry",
    });
    expect((drops[0].before as { spellcasting: { concentratingOn: unknown } }).spellcasting.concentratingOn)
      .toEqual({ entryId: "old-entry", spellName: "Old Spell" });
    expect((drops[0].after as { spellcasting: { concentratingOn: unknown } }).spellcasting.concentratingOn)
      .toBeNull();
  });

  it("re-cast of the same concentration entry keeps it (no drop)", async () => {
    const host = bareHost({ entryId: "same", spellName: "Same Spell" });
    const cost = slotCostCtx();

    await prisma.$transaction((tx) =>
      castAbilityInTx(
        { tx, characterId, batchId: "batch-recast", sessionId: null, cost, concentrationHost: host },
        { name: "Same Spell", entryId: "same", cost: { kind: "slot", minLevel: 1 }, effect: HEAL,
          requested: 1, roll: 0, eventType: "castSpell", concentrates: true },
      )
    );

    expect(host.concentratingOn).toEqual({ entryId: "same", spellName: "Same Spell" });
    const drops = await prisma.characterEvent.findMany({ where: { characterId, type: "concentrationDropped" } });
    expect(drops).toHaveLength(0);
  });

  it("self-apply damage subtracts HP; heal restores it", async () => {
    const cost = slotCostCtx();

    await prisma.$transaction((tx) =>
      castAbilityInTx(
        { tx, characterId, batchId: "batch-dmg", sessionId: null, cost, concentrationHost: bareHost() },
        { name: "Self Zap", entryId: "e-dmg", cost: { kind: "none" }, effect: DAMAGE_FIRE,
          roll: 6, eventType: "castSpell", concentrates: false,
          apply: { target: "self", kind: "damage", amount: 6 } },
      )
    );
    let row = await prisma.character.findUniqueOrThrow({ where: { id: characterId } });
    expect((row.hitPoints as { current: number }).current).toBe(14); // 20 → 14

    await prisma.$transaction((tx) =>
      castAbilityInTx(
        { tx, characterId, batchId: "batch-heal", sessionId: null, cost, concentrationHost: bareHost() },
        { name: "Self Mend", entryId: "e-heal", cost: { kind: "none" }, effect: HEAL,
          roll: 4, eventType: "castSpell", concentrates: false,
          apply: { target: "self", kind: "heal", amount: 4 } },
      )
    );
    row = await prisma.character.findUniqueOrThrow({ where: { id: characterId } });
    expect((row.hitPoints as { current: number }).current).toBe(18); // 14 → 18
  });
});
