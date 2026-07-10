/**
 * Active-effects (buff) integration test — drives the real cast seam
 * (castAbilityInTx) against Postgres, then asserts apply → serialize → replace →
 * clear → undo. Requires DATABASE_URL (docker compose up db).
 */

import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "@/app.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";
import { castAbilityInTx } from "@/lib/spellcasting/ability-cast.js";
import { clearBuffsForSourceInTx, normalizeActiveEffectsMutable } from "@/lib/active-effects.js";
import type { EffectSpec } from "@/lib/effects.js";
import { normalizeSpellcastingMutable } from "@/lib/spellcasting/spell-state.js";
import { revertBatch } from "@/lib/activity.js";

const OWNER_ID = "owner-active-effects";
const FIXTURE_ID = "test-active-effects-character-1";
let COOKIE: string;

function buffEffect(target: string, modifier: number): EffectSpec {
  return {
    effectType: "buff",
    scaling: { mode: "none" },
    concentration: true,
    buffTarget: target,
    buffModifier: modifier,
  };
}

// Mirror the dispatcher: load spell state, run the shared caster, persist
// concentratingOn back. Returns the batchId so the caller can revert it.
async function castBuff(entryId: string, name: string, target: string, modifier: number): Promise<string> {
  const batchId = randomUUID();
  await prisma.$transaction(async (tx) => {
    const row = await tx.character.findUniqueOrThrow({
      where: { id: FIXTURE_ID },
      select: { spellcasting: true },
    });
    const state = normalizeSpellcastingMutable(row.spellcasting);
    await castAbilityInTx(
      { tx, characterId: FIXTURE_ID, batchId, sessionId: null, cost: { tx, characterId: FIXTURE_ID, batchId, sessionId: null }, concentrationHost: state },
      { name, entryId, cost: { kind: "none" }, effect: buffEffect(target, modifier), roll: 0, eventType: "castSpell", concentrates: true },
    );
    await tx.character.update({
      where: { id: FIXTURE_ID },
      data: {
        spellcasting: {
          slotsUsed: state.slotsUsed,
          arcanumUsed: state.arcanumUsed,
          spells: state.spells,
          concentratingOn: state.concentratingOn,
        } as never,
      },
    });
  });
  return batchId;
}

async function readBuffs() {
  const row = await prisma.character.findUniqueOrThrow({ where: { id: FIXTURE_ID }, select: { activeEffects: true } });
  return normalizeActiveEffectsMutable(row.activeEffects).buffs;
}

describe("buff cast → apply / serialize / replace / clear / undo", () => {
  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
    await prisma.character.create({
      data: {
        id: FIXTURE_ID,
        name: "Buff Test Rogue",
        alignment: "Neutral",
        ownerId: OWNER_ID,
        experiencePoints: 0,
        initiativeBonus: 2,
        speed: 30,
        hitPoints: { current: 10, max: 10, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        hitDice: { total: 1, die: "d8", spent: 0 },
        abilityScores: { strength: 14, dexterity: 14, constitution: 12, intelligence: 10, wisdom: 10, charisma: 10 },
        savingThrowProficiencies: [],
        skills: [{ name: "athletics", ability: "strength", proficient: false }],
        toolProficiencies: [],
        currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
      },
    });
  });

  afterEach(async () => {
    await prisma.characterEvent.deleteMany({ where: { characterId: FIXTURE_ID } });
    await prisma.character.deleteMany({ where: { id: FIXTURE_ID } });
  });

  it("applies a tracked buff tagged with the casting entry id", async () => {
    await castBuff("spell-a", "Enhance Ability", "athletics", 4);
    const buffs = await readBuffs();
    expect(buffs).toHaveLength(1);
    expect(buffs[0]).toMatchObject({ target: "athletics", modifier: 4, source: "Enhance Ability", sourceEntryId: "spell-a" });
  });

  it("surfaces the buff as a tempModifier + breakdown on the affected skill", async () => {
    await castBuff("spell-a", "Enhance Ability", "athletics", 4);
    const res = await supertest.agent(createApp()).set("Cookie", COOKIE).get(`/api/characters/${FIXTURE_ID}`);
    expect(res.status).toBe(200);
    const athletics = (res.body.skills as Array<{ name: string; tempModifier?: number; tempModifierSources?: Array<{ label: string; value: number }> }>)
      .find((s) => s.name === "athletics");
    expect(athletics?.tempModifier).toBe(4);
    expect(athletics?.tempModifierSources).toEqual([{ label: "Enhance Ability", value: 4 }]);
    expect(res.body.activeEffects.buffs).toHaveLength(1);
  });

  it("re-casting the same buff replaces (does not stack)", async () => {
    await castBuff("spell-a", "Enhance Ability", "athletics", 4);
    await castBuff("spell-a", "Enhance Ability", "athletics", 4);
    expect(await readBuffs()).toHaveLength(1);
  });

  it("casting a new concentration buff clears the prior one (concentration replace)", async () => {
    await castBuff("spell-a", "Enhance Ability", "athletics", 4);
    await castBuff("spell-b", "Guidance", "arcana", 2);
    const buffs = await readBuffs();
    expect(buffs).toHaveLength(1);
    expect(buffs[0]).toMatchObject({ target: "arcana", sourceEntryId: "spell-b" });
  });

  it("clears buffs when their source concentration ends", async () => {
    await castBuff("spell-a", "Enhance Ability", "athletics", 4);
    await prisma.$transaction((tx) =>
      clearBuffsForSourceInTx(tx, FIXTURE_ID, "spell-a", randomUUID(), null, "damage"),
    );
    expect(await readBuffs()).toHaveLength(0);
  });

  it("reverts the buff via undo of its batch", async () => {
    const batchId = await castBuff("spell-a", "Enhance Ability", "athletics", 4);
    expect(await readBuffs()).toHaveLength(1);
    const result = await revertBatch(prisma, FIXTURE_ID, batchId);
    expect(result.ok).toBe(true);
    expect(await readBuffs()).toHaveLength(0);
  });
});
