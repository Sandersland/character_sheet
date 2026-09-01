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
  effectDiceFaces?: number | null;
  effectModifier?: number | null;
  instanceCount?: number | null;
  instanceRoll?: "each" | "once" | null;
  upcastInstancesPerLevel?: number | null;
  upcastDicePerLevel?: number | null;
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
let magicMissile2024Id: string;
let magicMissile2014Id: string;

beforeAll(async () => {
  await ensureTestOwner(OWNER_ID);
  const fb = await prisma.spell.findFirstOrThrow({ where: { name: "Fireball" } });
  fireballId = fb.id;
  fireballDesc = fb.description;
  const mm2024 = await prisma.spell.findFirstOrThrow({ where: { name: "Magic Missile", edition: "EDITION_2024" } });
  magicMissile2024Id = mm2024.id;
  const mm2014 = await prisma.spell.findFirstOrThrow({ where: { name: "Magic Missile", edition: "EDITION_2014" } });
  magicMissile2014Id = mm2014.id;
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

  // #1981 review: a character who learned Magic Missile BEFORE the multi-instance rewrite has a
  // snapshot frozen in the old combined-dice shape (3d4+3, no instanceCount) — the seed rewrite alone
  // never reaches it. This resync is how the upcast-modifier fix actually lands on existing sheets.
  it("corrects an OLD-shape 2024 Magic Missile snapshot to the per-instance shape (#1981)", async () => {
    await makeCaster("res-mm-2024", [{
      id: "entry-mm24", spellId: magicMissile2024Id, name: "Magic Missile", level: 1, school: "evocation",
      prepared: true, castingTime: "1 action", range: "120 ft", duration: "Instantaneous",
      description: "stale pre-#1981 text", effectDiceCount: 3, effectDiceFaces: 4, effectModifier: 3,
      upcastDicePerLevel: 1,
    }]);

    const result = await resyncSpellSnapshots(prisma);
    expect(result.changedCharacters).toContain("res-mm-2024");

    const [entry] = await readSpells("res-mm-2024");
    expect(entry.effectDiceCount).toBe(1);
    expect(entry.effectDiceFaces).toBe(4);
    expect(entry.effectModifier).toBe(1);
    expect(entry.instanceCount).toBe(3);
    expect(entry.upcastInstancesPerLevel).toBe(1);
    expect(entry.instanceRoll).toBe("each");
    // catalogSnapshotFields spreads the catalog row's own nulls verbatim (pre-existing behavior,
    // unrelated to #1981) — the row no longer sets upcastDicePerLevel, so this clears to null.
    expect(entry.upcastDicePerLevel).toBeNull();
  });

  it("corrects an OLD-shape 2014 Magic Missile snapshot too — instanceRoll 'once' for that edition (#1981)", async () => {
    await makeCaster("res-mm-2014", [{
      id: "entry-mm14", spellId: magicMissile2014Id, name: "Magic Missile", level: 1, school: "evocation",
      prepared: true, castingTime: "1 action", range: "120 feet", duration: "Instantaneous",
      description: "stale pre-#1981 text", effectDiceCount: 3, effectDiceFaces: 4, effectModifier: 3,
      upcastDicePerLevel: 1,
    }]);

    await resyncSpellSnapshots(prisma);

    const [entry] = await readSpells("res-mm-2014");
    expect(entry.effectDiceCount).toBe(1);
    expect(entry.effectModifier).toBe(1);
    expect(entry.instanceCount).toBe(3);
    expect(entry.instanceRoll).toBe("once");
  });
});
