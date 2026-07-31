/**
 * #1546 Part B-i: `resolveLevelUpContext` resolves the featureRows carrier by
 * FK ONLY — no name/slug-keyed ClassFeature lookup anywhere (Ruling 1). This
 * is the DB-backed proof, against the REAL seeded Fighter/Battle Master
 * catalog, that both planner paths receive a non-empty carrier:
 *
 * - The PERSISTED path: an existing class entry with `subclassId` already
 *   set — `targetEntry.classFeatureRows`/`subclassFeatureRows` resolve
 *   through `TARGET_ENTRY_SELECT` (mirroring characterInclude).
 * - The re-plan (`?subclassId=`) path: no subclass committed yet —
 *   `pickedSubclassFeatureRows` resolves through the enhanced
 *   `prisma.subclass.findUnique`, the "one line" fix Ruling 1 describes.
 *
 * Uses the real seeded catalog (no bespoke Subclass row) so this is also a
 * proof against production content, not a hand-built fixture.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { resolveLevelUpContext } from "@/lib/leveling/level-up-transaction.js";

const OWNER_ID = "owner-level-up-context-feature-rows";
const CHAR_PERSISTED_ID = "levelup-ctx-persisted-bm";
const CHAR_REPLAN_ID = "levelup-ctx-replan-bm";

const BASE = {
  alignment: "True Neutral",
  initiativeBonus: 0,
  speed: 30,
  savingThrowProficiencies: [],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
  hitPoints: { current: 40, max: 40, temp: 0, deathSaves: { successes: 0, failures: 0 } },
  abilityScores: { strength: 16, dexterity: 12, constitution: 14, intelligence: 13, wisdom: 10, charisma: 10 },
  spellcasting: Prisma.JsonNull,
};

let fighterClassId: string;
let battleMasterSubclassId: string;

beforeAll(async () => {
  await ensureTestOwner(OWNER_ID);
  const fighter = await prisma.characterClass.findFirstOrThrow({ where: { name: "Fighter" } });
  fighterClassId = fighter.id;
  const battleMaster = await prisma.subclass.findFirstOrThrow({ where: { classId: fighter.id, name: "Battle Master" } });
  battleMasterSubclassId = battleMaster.id;

  await prisma.character.create({
    data: {
      ...BASE,
      ownerId: OWNER_ID,
      id: CHAR_PERSISTED_ID,
      name: "LevelUpCtx Persisted BM",
      experiencePoints: 23000, // level 7
      hitDice: { total: 7, die: "d10", spent: 0 },
      classEntries: {
        create: [{ name: "fighter", subclass: "Battle Master", subclassId: battleMasterSubclassId, classId: fighterClassId, position: 0, level: 7 }],
      },
    },
  });

  await prisma.character.create({
    data: {
      ...BASE,
      ownerId: OWNER_ID,
      id: CHAR_REPLAN_ID,
      name: "LevelUpCtx Replan BM",
      experiencePoints: 900, // level 3 — the subclass gate
      hitDice: { total: 2, die: "d10", spent: 0 },
      classEntries: {
        create: [{ name: "fighter", subclass: null, subclassId: null, classId: fighterClassId, position: 0, level: 2 }],
      },
    },
  });
});

afterAll(async () => {
  await prisma.character.deleteMany({ where: { id: { in: [CHAR_PERSISTED_ID, CHAR_REPLAN_ID] } } });
});

describe("resolveLevelUpContext — featureRows carrier, both planner paths (#1546 Part B-i)", () => {
  it("PERSISTED path: targetEntry.classFeatureRows/subclassFeatureRows both resolve non-empty by FK", async () => {
    const entry = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: CHAR_PERSISTED_ID } });
    const context = await resolveLevelUpContext(CHAR_PERSISTED_ID, { kind: "existing", classEntryId: entry.id });

    expect(context.targetEntry.classFeatureRows).toBeDefined();
    expect(context.targetEntry.classFeatureRows!.length).toBeGreaterThan(0);
    expect(context.targetEntry.classFeatureRows!.some((r) => r.name === "Second Wind")).toBe(true);

    expect(context.targetEntry.subclassFeatureRows).toBeDefined();
    expect(context.targetEntry.subclassFeatureRows!.length).toBeGreaterThan(0);
    expect(context.targetEntry.subclassFeatureRows!.some((r) => r.name === "Combat Superiority")).toBe(true);

    // The re-plan (picked) channel stays untouched on the persisted path — no
    // ?subclassId= was submitted.
    expect(context.pickedSubclassFeatureRows).toBeNull();
  });

  it("RE-PLAN path (?subclassId=): pickedSubclassFeatureRows resolves non-empty; targetEntry.subclassFeatureRows stays empty (nothing persisted yet)", async () => {
    const entry = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: CHAR_REPLAN_ID } });
    const context = await resolveLevelUpContext(CHAR_REPLAN_ID, { kind: "existing", classEntryId: entry.id }, battleMasterSubclassId);

    expect(context.chosenSubclassName).toBe("Battle Master");
    expect(context.pickedSubclassFeatureRows).not.toBeNull();
    expect(context.pickedSubclassFeatureRows!.length).toBeGreaterThan(0);
    expect(context.pickedSubclassFeatureRows!.some((r) => r.name === "Combat Superiority")).toBe(true);

    // Nothing is persisted for this character yet (subclass: null on the row) —
    // the PERSISTED half of the carrier must stay empty; only the PICKED
    // channel carries the not-yet-committed pick's rows.
    expect(context.targetEntry.subclass).toBeNull();
    expect(context.targetEntry.subclassFeatureRows ?? []).toEqual([]);
    // The class's own rows still resolve regardless (unrelated to the subclass pick).
    expect(context.targetEntry.classFeatureRows!.some((r) => r.name === "Second Wind")).toBe(true);
  });
});
