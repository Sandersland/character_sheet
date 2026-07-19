import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { migrateKnownCastersPrepared } from "../migrate-known-casters-prepared-2024.js";

const OWNER_ID = "owner-migrate-prepared";

// N level-1 leveled spells, all UNPREPARED (the 2014 known-caster storage shape).
function unpreparedSpells(total: number) {
  return Array.from({ length: total }, (_, i) => ({
    id: `mig-${i + 1}`, name: `Migrate ${i + 1}`, level: 1, school: "evocation", prepared: false,
    castingTime: "1 action", range: "60 ft", duration: "Instantaneous", description: "x",
  }));
}

const BASE = {
  alignment: "Neutral", initiativeBonus: 0, speed: 30,
  savingThrowProficiencies: [], skills: [], toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
  hitPoints: { current: 30, max: 30, temp: 0 }, hitDice: { total: 5, die: "d8" },
};

let warlockId: string;
let sorcererId: string;
let wizardId: string;

async function seedCaster(id: string, className: string, classId: string, xp: number, cha: number, total: number) {
  return prisma.character.create({
    data: {
      ...BASE, id, name: `MigChar ${id}`, ownerId: OWNER_ID, experiencePoints: xp,
      abilityScores: { strength: 8, dexterity: 12, constitution: 12, intelligence: cha, wisdom: 10, charisma: cha },
      spellcasting: { slotsUsed: {}, arcanumUsed: {}, concentratingOn: null, spells: unpreparedSpells(total) } as Prisma.InputJsonValue,
      classEntries: { create: [{ name: className, classId, position: 0, level: className === "sorcerer" ? 3 : 5 }] },
    },
  });
}

beforeAll(async () => {
  await ensureTestOwner(OWNER_ID);
  warlockId = (await prisma.characterClass.findFirstOrThrow({ where: { name: "Warlock" } })).id;
  sorcererId = (await prisma.characterClass.findFirstOrThrow({ where: { name: "Sorcerer" } })).id;
  wizardId = (await prisma.characterClass.findFirstOrThrow({ where: { name: "Wizard" } })).id;
});

afterEach(async () => {
  await prisma.character.deleteMany({ where: { name: { startsWith: "MigChar" } } });
});

afterAll(async () => {
  await prisma.character.deleteMany({ where: { name: { startsWith: "MigChar" } } });
});

async function preparedCount(id: string): Promise<number> {
  const c = await prisma.character.findUniqueOrThrow({ where: { id } });
  const spells = (c.spellcasting as { spells: Array<{ prepared: boolean; level: number }> }).spells;
  return spells.filter((s) => s.prepared && s.level > 0).length;
}

describe("migrateKnownCastersPrepared (#1127)", () => {
  it("(a) warlock 6 unprepared entries, cap 6 → all prepared", async () => {
    await seedCaster("mig-wl", "warlock", warlockId, 6500, 16, 6); // Warlock 5 → cap 6
    const result = await migrateKnownCastersPrepared(prisma);
    expect(await preparedCount("mig-wl")).toBe(6);
    expect(result.changedCharacters).toContain("mig-wl");
  });

  it("(b) sorcerer 8 entries, cap 6 → first 6 prepared", async () => {
    await seedCaster("mig-sorc", "sorcerer", sorcererId, 900, 16, 8); // Sorcerer 3 → cap 6
    await migrateKnownCastersPrepared(prisma);
    expect(await preparedCount("mig-sorc")).toBe(6);
    const c = await prisma.character.findUniqueOrThrow({ where: { id: "mig-sorc" } });
    const spells = (c.spellcasting as { spells: Array<{ id: string; prepared: boolean }> }).spells;
    expect(spells.filter((s) => s.prepared).map((s) => s.id)).toEqual(
      ["mig-1", "mig-2", "mig-3", "mig-4", "mig-5", "mig-6"],
    );
  });

  it("(c) a wizard-only character (2014 prepared caster) is untouched", async () => {
    await seedCaster("mig-wiz", "wizard", wizardId, 6500, 16, 8); // wizard not in the frozen known-caster set
    const result = await migrateKnownCastersPrepared(prisma);
    expect(await preparedCount("mig-wiz")).toBe(0); // left exactly as seeded
    expect(result.changedCharacters).not.toContain("mig-wiz");
  });

  it("(d) is idempotent — a second run changes nothing", async () => {
    await seedCaster("mig-idem", "warlock", warlockId, 6500, 16, 6);
    await migrateKnownCastersPrepared(prisma);
    const second = await migrateKnownCastersPrepared(prisma);
    expect(second.changedCharacters).not.toContain("mig-idem");
    expect(await preparedCount("mig-idem")).toBe(6);
  });

  it("writes one undoable prepareSpell event per changed character", async () => {
    await seedCaster("mig-ev", "warlock", warlockId, 6500, 16, 6);
    await migrateKnownCastersPrepared(prisma);
    const events = await prisma.characterEvent.findMany({ where: { characterId: "mig-ev", type: "prepareSpell" } });
    expect(events).toHaveLength(1);
    expect(events[0].category).toBe("spellcasting");
    expect((events[0].before as { spellcasting: { spells: Array<{ prepared: boolean }> } }).spellcasting.spells.every((s) => !s.prepared)).toBe(true);
    expect((events[0].after as { spellcasting: { spells: Array<{ prepared: boolean }> } }).spellcasting.spells.every((s) => s.prepared)).toBe(true);
  });
});
