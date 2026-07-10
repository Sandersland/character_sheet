import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { applySpellcastingOperations } from "@/lib/spellcasting/spellcasting.js";
import { applyHitPointOperations } from "@/lib/hitpoints.js";
import { revertBatch } from "@/lib/activity.js";

const OWNER_ID = "owner-item-cast-op";

const SPELL = {
  name: "Item Cast Op Witch Bolt",
  level: 1,
  school: "evocation" as const,
  castingTime: "1 action",
  range: "30 ft",
  duration: "Concentration, up to 1 minute",
  description: "A beam of crackling energy.",
  concentration: true,
  effectKind: "damage",
  effectDiceCount: 1,
  effectDiceFaces: 12,
  damageType: "lightning",
  attackType: "attack",
  classes: ["wizard"],
};

const BASE = {
  alignment: "Neutral",
  experiencePoints: 0,
  initiativeBonus: 0,
  speed: 30,
  hitPoints: { current: 30, max: 30, temp: 0 },
  hitDice: { total: 3, die: "d12" },
  savingThrowProficiencies: [],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
};

function castCap(spellId: string, over: Record<string, unknown> = {}) {
  return {
    kind: "castSpell" as const,
    spellId,
    spellName: "Witch Bolt",
    spellLevel: 1,
    castLevel: 1,
    castResource: "perRestShort" as const,
    castUses: 1,
    castConcentration: true,
    dcMode: "fixed" as const,
    dcValue: 15,
    attackMode: "fixed" as const,
    attackValue: 7,
    ...over,
  };
}

async function used(itemId: string) {
  const cap = await prisma.inventoryCapability.findFirstOrThrow({ where: { inventoryItemId: itemId } });
  return cap.used;
}

// The derived item-spell entry id carries the capability id suffix (#528 review
// fix — keeps two castSpell caps for the same spell distinct), so resolve it from
// the live capability rather than hardcoding the seam.
async function entryIdFor(itemId: string): Promise<string> {
  const cap = await prisma.inventoryCapability.findFirstOrThrow({ where: { inventoryItemId: itemId } });
  return `item:${itemId}:${cap.spellId}:${cap.id}`;
}

describe("castItemSpell op (#528)", () => {
  let spellId: string;

  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    const spell = await prisma.spell.upsert({ where: { name: SPELL.name }, create: SPELL, update: SPELL });
    spellId = spell.id;
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { ownerId: OWNER_ID } });
    await prisma.spell.deleteMany({ where: { name: SPELL.name } });
  });

  async function makeHolder(className: string, abilityScores: Record<string, number>, capOver: Record<string, unknown> = {}) {
    const character = await prisma.character.create({
      data: {
        ...BASE,
        name: `${className} holder`,
        abilityScores,
        ownerId: OWNER_ID,
        spellcasting: Prisma.JsonNull,
        classEntries: { create: { name: className, level: 3, position: 0 } },
        inventoryItems: {
          create: {
            name: "Wand of Witch Bolt",
            category: "gear",
            quantity: 1,
            requiresAttunement: true,
            attuned: true,
            capabilities: { create: [castCap(spellId, capOver)] },
          },
        },
      },
      include: { inventoryItems: true },
    });
    return { characterId: character.id, itemId: character.inventoryItems[0].id };
  }

  const NONCASTER_SCORES = { strength: 16, dexterity: 12, constitution: 14, intelligence: 8, wisdom: 10, charisma: 10 };

  it("a non-caster casts a fixed-DC item spell, spending the item resource (not a slot)", async () => {
    const { characterId, itemId } = await makeHolder("Barbarian", NONCASTER_SCORES);
    const entryId = await entryIdFor(itemId);

    await applySpellcastingOperations(characterId, [{ type: "castItemSpell", entryId, roll: 9 }], OWNER_ID);

    expect(await used(itemId)).toBe(1);
    const ev = await prisma.characterEvent.findFirstOrThrow({ where: { characterId, type: "castSpell" } });
    expect(ev.summary).toContain("Witch Bolt");
    expect(ev.summary).toContain("DC 15");
    expect((ev.data as Record<string, unknown>).source).toBe("item");
    expect((ev.data as Record<string, unknown>).dc).toBe(15);

    // Character spell state carries no slots spent — the item resource was used instead.
    const char = await prisma.character.findUniqueOrThrow({ where: { id: characterId }, select: { spellcasting: true } });
    const sc = char.spellcasting as { slotsUsed?: Record<string, number>; spells?: unknown[] };
    expect(Object.values(sc.slotsUsed ?? {}).reduce((a, b) => a + b, 0)).toBe(0);
    // Derived item spells are never persisted into the blob.
    expect(sc.spells ?? []).toHaveLength(0);
  });

  it("blocks a second cast once uses are exhausted, then restores them on a short rest", async () => {
    const { characterId, itemId } = await makeHolder("Barbarian", NONCASTER_SCORES);
    const entryId = await entryIdFor(itemId);

    await applySpellcastingOperations(characterId, [{ type: "castItemSpell", entryId, roll: 9 }], OWNER_ID);
    await expect(
      applySpellcastingOperations(characterId, [{ type: "castItemSpell", entryId, roll: 9 }], OWNER_ID),
    ).rejects.toThrow(/no uses remaining/i);
    expect(await used(itemId)).toBe(1);

    await applyHitPointOperations(characterId, [{ type: "shortRest", rolls: [] }]);
    expect(await used(itemId)).toBe(0);

    // Castable again after the rest.
    await applySpellcastingOperations(characterId, [{ type: "castItemSpell", entryId, roll: 9 }], OWNER_ID);
    expect(await used(itemId)).toBe(1);
  });

  it("a long rest restores a perRestLong item spell that a short rest does not", async () => {
    const { characterId, itemId } = await makeHolder("Barbarian", NONCASTER_SCORES, { castResource: "perRestLong" });
    const entryId = await entryIdFor(itemId);
    await applySpellcastingOperations(characterId, [{ type: "castItemSpell", entryId, roll: 9 }], OWNER_ID);
    expect(await used(itemId)).toBe(1);

    await applyHitPointOperations(characterId, [{ type: "shortRest", rolls: [] }]);
    expect(await used(itemId)).toBe(1); // short rest does NOT recharge a long-rest resource

    await applyHitPointOperations(characterId, [{ type: "longRest" }]);
    expect(await used(itemId)).toBe(0);
  });

  it("resolves a wielder-mode DC to the caster's own spell save DC", async () => {
    // Wizard L3, INT 16 → +3 mod, prof +2 → spell save DC 13.
    const wizScores = { strength: 8, dexterity: 12, constitution: 12, intelligence: 16, wisdom: 10, charisma: 10 };
    const { characterId, itemId } = await makeHolder("wizard", wizScores, { dcMode: "wielder", dcValue: null });
    const entryId = await entryIdFor(itemId);

    await applySpellcastingOperations(characterId, [{ type: "castItemSpell", entryId, roll: 9 }], OWNER_ID);
    const ev = await prisma.characterEvent.findFirstOrThrow({ where: { characterId, type: "castSpell" } });
    expect((ev.data as Record<string, unknown>).dc).toBe(13);
    expect(ev.summary).toContain("DC 13");
  });

  it("undo of a per-rest item-spell cast refunds the capability's used counter (#580)", async () => {
    const { characterId, itemId } = await makeHolder("Barbarian", NONCASTER_SCORES);
    const entryId = await entryIdFor(itemId);

    await applySpellcastingOperations(characterId, [{ type: "castItemSpell", entryId, roll: 9 }], OWNER_ID);
    expect(await used(itemId)).toBe(1);

    const ev = await prisma.characterEvent.findFirstOrThrow({ where: { characterId, type: "castSpell" } });
    const undone = await revertBatch(prisma, characterId, ev.batchId!);
    expect(undone.ok).toBe(true);
    expect(await used(itemId)).toBe(0); // the use is refunded, not silently lost
  });

  it("does not track uses for an at-will item spell", async () => {
    const { characterId, itemId } = await makeHolder("Barbarian", NONCASTER_SCORES, { castResource: "atWill" });
    const entryId = await entryIdFor(itemId);
    await applySpellcastingOperations(characterId, [{ type: "castItemSpell", entryId, roll: 9 }], OWNER_ID);
    await applySpellcastingOperations(characterId, [{ type: "castItemSpell", entryId, roll: 9 }], OWNER_ID);
    expect(await used(itemId)).toBe(0);
  });
});
