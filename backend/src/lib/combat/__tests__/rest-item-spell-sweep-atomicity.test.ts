// Pins the rest sweep's atomicity (#1649 AC): resetItemSpellUsesOnRest collects
// every qualifying capability's key across ALL items first, then resets them in
// ONE inventoryCapabilityUse.updateMany call — never a per-item loop. A per-item
// loop would pass every behavioural assertion in this file while reintroducing
// the race the side table (InventoryCapabilityUse) exists to prevent, so the
// CALL COUNT is the assertion, not just the resulting `used` values.
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { inventoryItemFixtureData } from "@/test-support/inventory-snapshot-fixture.js";
import { applyHitPointOperations } from "@/lib/combat/hitpoints.js";
import * as inventoryCapabilityUse from "@/lib/inventory/inventory-capability-use.js";

const OWNER_ID = "owner-rest-sweep-atomicity";

const BASE_CHAR = {
  alignment: "Neutral",
  experiencePoints: 0,
  initiativeBonus: 0,
  speed: 30,
  hitPoints: { current: 10, max: 10, temp: 0 },
  hitDice: { total: 1, die: "d8" },
  abilityScores: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
  savingThrowProficiencies: [],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
};

describe("rest sweep atomicity (#1649)", () => {
  const characterIds: string[] = [];

  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await prisma.character.deleteMany({ where: { id: { in: characterIds } } });
  });

  it("resets every attuned item's castSpell use counter in ONE updateMany, across multiple items", async () => {
    const character = await prisma.character.create({
      data: { ...BASE_CHAR, name: "Rest Sweep Fixture", ownerId: OWNER_ID, spellcasting: Prisma.JsonNull },
    });
    characterIds.push(character.id);

    // Three separate items, each attuned with a spent castSpell capability
    // whose resource recharges on a short rest — the sweep must reset all
    // three keys in a single updateMany, not one call per item.
    for (const name of ["Ring A", "Ring B", "Ring C"]) {
      await prisma.inventoryItem.create({
        data: inventoryItemFixtureData({
          characterId: character.id,
          name,
          category: "gear",
          requiresAttunement: true,
          attuned: true,
          capabilities: [
            {
              kind: "castSpell",
              spellId: "atomicity-fixture-spell",
              spellName: "Test Zap",
              spellLevel: 1,
              castLevel: 1,
              castResource: "perRestShort",
              castUses: 1,
              used: 1,
            },
          ],
        }),
      });
    }

    const spy = vi.spyOn(inventoryCapabilityUse, "mirrorCapabilityUsedResetMany");

    await applyHitPointOperations(character.id, [{ type: "shortRest", rolls: [6] }]);

    // The one assertion that matters: exactly one call resets all three items'
    // capabilities together, not three separate calls.
    expect(spy).toHaveBeenCalledTimes(1);

    const items = await prisma.inventoryItem.findMany({
      where: { characterId: character.id },
      include: { capabilityUses: true },
    });
    for (const item of items) {
      expect(item.capabilityUses).toHaveLength(1);
      expect(item.capabilityUses[0].used).toBe(0);
    }
  });
});
