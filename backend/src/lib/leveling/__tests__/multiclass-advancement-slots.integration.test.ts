/**
 * Multiclass ASI/feat slot cap (#1073): PHB'24 p.163 — slots accrue per CLASS
 * level, not primary-class × total level. Before this fix a Wizard 3 / Fighter 8
 * character got the Wizard schedule at total level 11 (2 slots: L4, L8),
 * missing Fighter's level-6 bonus ASI entirely.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { InvalidAdvancementOperationError, applyAdvancementOpInTx } from "@/lib/leveling/advancement.js";
import { applyExperienceOperations } from "@/lib/leveling/experience-ops.js";

const OWNER_ID = "owner-multiclass-adv-slots";
const BATCH = "batch-multiclass-adv-slots";
const XP_LVL_11 = 85000; // Wizard 3 / Fighter 8 → total level 11
const XP_LVL_8 = 34000; // total level 8 (level-down target)

const BASE_ABILITY_SCORES = {
  strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10,
};

const BASE_CHAR = {
  name: "Multiclass ASI Slots Fixture",
  alignment: "True Neutral",
  initiativeBonus: 0,
  speed: 30,
  hitPoints: { current: 88, max: 88, temp: 0 },
  hitDice: { total: 11, die: "d10" },
  abilityScores: BASE_ABILITY_SCORES,
  savingThrowProficiencies: [],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
};

describe("Multiclass ASI/feat slot cap (#1073)", () => {
  const created: string[] = [];

  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
  });

  afterEach(async () => {
    if (created.length) await prisma.character.deleteMany({ where: { id: { in: created.splice(0) } } });
  });

  async function fixture(experiencePoints: number) {
    const character = await prisma.character.create({
      data: {
        ...BASE_CHAR,
        ownerId: OWNER_ID,
        experiencePoints,
        spellcasting: Prisma.JsonNull,
        classEntries: {
          create: [
            { name: "Wizard", level: 3, position: 0 },
            { name: "Fighter", level: 8, position: 1 },
          ],
        },
      },
    });
    created.push(character.id);
    return character.id;
  }

  it("Wizard 3 / Fighter 8 grants 3 ASI slots (Fighter's 4/6/8), not the Wizard schedule at total level 11", async () => {
    const id = await fixture(XP_LVL_11);

    // Old bug: advancementSlotsForLevel("Wizard", 11) = 2 (L4, L8 only) — the
    // 3rd take below would have been rejected.
    await prisma.$transaction((tx) =>
      applyAdvancementOpInTx(tx, id, { type: "takeAsi", increases: [{ ability: "strength", amount: 2 }] }, BATCH, null),
    );
    await prisma.$transaction((tx) =>
      applyAdvancementOpInTx(tx, id, { type: "takeAsi", increases: [{ ability: "dexterity", amount: 2 }] }, BATCH, null),
    );
    await prisma.$transaction((tx) =>
      applyAdvancementOpInTx(tx, id, { type: "takeAsi", increases: [{ ability: "constitution", amount: 2 }] }, BATCH, null),
    );

    const row = await prisma.character.findUniqueOrThrow({ where: { id } });
    expect(row.abilityScores).toEqual({ ...BASE_ABILITY_SCORES, strength: 12, dexterity: 12, constitution: 12 });

    // The 4th ASI is beyond the 3-slot cap.
    await expect(
      prisma.$transaction((tx) =>
        applyAdvancementOpInTx(tx, id, { type: "takeAsi", increases: [{ ability: "intelligence", amount: 2 }] }, BATCH, null),
      ),
    ).rejects.toThrowError(new InvalidAdvancementOperationError("No advancement slots available (3/3 used)"));
  });

  it("leveling the Fighter entry down to 5 reconciles the level-6 ASI slot away LIFO", async () => {
    const id = await fixture(XP_LVL_11);

    // Take 2 of the 3 available slots (Fighter's L4 and L6 entitlement).
    await prisma.$transaction((tx) =>
      applyAdvancementOpInTx(tx, id, { type: "takeAsi", increases: [{ ability: "strength", amount: 2 }] }, BATCH, null),
    );
    await prisma.$transaction((tx) =>
      applyAdvancementOpInTx(tx, id, { type: "takeAsi", increases: [{ ability: "dexterity", amount: 2 }] }, BATCH, null),
    );

    // Drop total XP to level 8. reconcileClassEntryLevels (position-ordered
    // LIFO) trims the higher-position Fighter entry from 8 → 5, leaving Wizard
    // untouched at 3. At Fighter 5 only the L4 slot is earned (1 total), so
    // reconcileAdvancements trims the excess used slot (2 → 1), removing the
    // most-recently-taken ASI (dexterity) and reversing its delta.
    await applyExperienceOperations(id, [{ type: "set", value: XP_LVL_8 }]);

    const row = await prisma.character.findUniqueOrThrow({
      where: { id },
      include: { classEntries: { orderBy: { position: "asc" } } },
    });
    expect(row.classEntries.map((e) => ({ name: e.name, level: e.level }))).toEqual([
      { name: "Wizard", level: 3 },
      { name: "Fighter", level: 5 },
    ]);
    expect(row.abilityScores).toEqual({ ...BASE_ABILITY_SCORES, strength: 12 });
    const resources = row.resources as { advancements: { abilityDeltas: Record<string, number> }[] };
    expect(resources.advancements).toHaveLength(1);
    expect(resources.advancements[0].abilityDeltas).toEqual({ strength: 2 });
  });
});
