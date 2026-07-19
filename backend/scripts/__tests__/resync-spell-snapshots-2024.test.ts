// resync-spell-snapshots-2024 (#1132): refreshes learned SpellEntry snapshots
// from the renamed/rebalanced SRD 5.2 catalog, keyed by spellId, preserving the
// per-character entry id / spellId / prepared flag. Requires DATABASE_URL.
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { resyncSpellSnapshots } from "../resync-spell-snapshots-2024.js";

const OWNER_ID = "owner-resync-snapshots";

interface Entry {
  id: string;
  spellId?: string;
  name: string;
  level: number;
  school: string;
  prepared: boolean;
  castingTime: string;
  range: string;
  duration: string;
  description: string;
  effectDiceCount?: number | null;
}

const BASE = {
  alignment: "Neutral", initiativeBonus: 0, speed: 30,
  savingThrowProficiencies: [], skills: [], toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
  hitPoints: { current: 20, max: 20, temp: 0 }, hitDice: { total: 3, die: "d6" },
  abilityScores: { strength: 10, dexterity: 12, constitution: 12, intelligence: 16, wisdom: 10, charisma: 10 },
};

async function makeCaster(id: string, spells: Entry[]) {
  return prisma.character.create({
    data: {
      ...BASE, id, name: `ResyncChar ${id}`, ownerId: OWNER_ID, experiencePoints: 900,
      spellcasting: { slotsUsed: {}, arcanumUsed: {}, concentratingOn: null, spells } as Prisma.InputJsonValue,
      classEntries: { create: [{ name: "Wizard", level: 3, position: 0 }] },
    },
  });
}

async function readSpells(id: string): Promise<Entry[]> {
  const c = await prisma.character.findUniqueOrThrow({ where: { id } });
  return (c.spellcasting as { spells: Entry[] }).spells;
}

let fireballId: string;
let fireballDesc: string;

beforeAll(async () => {
  await ensureTestOwner(OWNER_ID);
  const fb = await prisma.spell.findUniqueOrThrow({ where: { name: "Fireball" } });
  fireballId = fb.id;
  fireballDesc = fb.description;
});

afterEach(async () => {
  await prisma.character.deleteMany({ where: { name: { startsWith: "ResyncChar" } } });
});

describe("resyncSpellSnapshots (#1132)", () => {
  it("refreshes a stale catalog snapshot, preserving id / spellId / prepared", async () => {
    await makeCaster("res-a", [{
      id: "entry-a", spellId: fireballId, name: "Old Fireball", level: 3, school: "evocation",
      prepared: true, castingTime: "1 action", range: "150 ft", duration: "Instantaneous",
      description: "stale text", effectDiceCount: 1,
    }]);

    const result = await resyncSpellSnapshots(prisma);
    expect(result.changedCharacters).toContain("res-a");

    const [entry] = await readSpells("res-a");
    expect(entry.id).toBe("entry-a");
    expect(entry.spellId).toBe(fireballId);
    expect(entry.prepared).toBe(true);
    expect(entry.name).toBe("Fireball");
    expect(entry.description).toBe(fireballDesc);
    expect(entry.effectDiceCount).toBe(8);
  });

  it("leaves custom entries (no spellId) untouched", async () => {
    await makeCaster("res-custom", [{
      id: "entry-c", name: "Homebrew Bolt", level: 1, school: "evocation",
      prepared: false, castingTime: "1 action", range: "60 ft", duration: "Instantaneous",
      description: "custom", effectDiceCount: 2,
    }]);
    await resyncSpellSnapshots(prisma);
    const [entry] = await readSpells("res-custom");
    expect(entry.name).toBe("Homebrew Bolt");
    expect(entry.description).toBe("custom");
  });

  it("leaves a dangling spellId (no catalog row) untouched", async () => {
    await makeCaster("res-dangle", [{
      id: "entry-d", spellId: "00000000-0000-0000-0000-000000000000", name: "Ghost Spell",
      level: 2, school: "evocation", prepared: false, castingTime: "1 action",
      range: "60 ft", duration: "Instantaneous", description: "gone",
    }]);
    const result = await resyncSpellSnapshots(prisma);
    expect(result.changedCharacters).not.toContain("res-dangle");
    const [entry] = await readSpells("res-dangle");
    expect(entry.name).toBe("Ghost Spell");
  });

  it("is idempotent — a second run changes nothing", async () => {
    await makeCaster("res-idem", [{
      id: "entry-i", spellId: fireballId, name: "Old Fireball", level: 3, school: "evocation",
      prepared: false, castingTime: "1 action", range: "150 ft", duration: "Instantaneous",
      description: "stale", effectDiceCount: 1,
    }]);
    await resyncSpellSnapshots(prisma);
    const second = await resyncSpellSnapshots(prisma);
    expect(second.changedCharacters).not.toContain("res-idem");
  });
});
