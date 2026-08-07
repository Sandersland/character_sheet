// #1784 (1/5 of epic #1782): schema-only foundation for homebrew spells.
// Spell.ownerId is NULL for system/seeded rows, non-null for a user's
// homebrew. Pins the two invariants the schema promises: a Spell can carry
// an owner, and deleting that owner cascades to only their own rows.
import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";

const MADE_SPELLS: string[] = [];
const MADE_USERS: string[] = [];

function spellFixture(overrides: Partial<Parameters<typeof prisma.spell.create>[0]["data"]> = {}) {
  return {
    name: `Owner Fixture Spell ${randomUUID()}`,
    level: 1,
    school: "evocation" as const,
    castingTime: "1 action",
    range: "60 feet",
    duration: "Instantaneous",
    description: "Test fixture spell for #1784.",
    ...overrides,
  };
}

afterEach(async () => {
  if (MADE_SPELLS.length) {
    await prisma.spell.deleteMany({ where: { id: { in: MADE_SPELLS.splice(0) } } });
  }
  if (MADE_USERS.length) {
    await prisma.user.deleteMany({ where: { id: { in: MADE_USERS.splice(0) } } });
  }
});

describe("Spell.ownerId (#1784)", () => {
  it("allows a Spell row to carry an ownerId pointing at a User", async () => {
    const ownerId = `spell-owner-${randomUUID()}`;
    await ensureTestOwner(ownerId);
    MADE_USERS.push(ownerId);

    const spell = await prisma.spell.create({ data: spellFixture({ ownerId }) });
    MADE_SPELLS.push(spell.id);

    expect(spell.ownerId).toBe(ownerId);
  });

  it("cascade-deletes only the deleted user's owned Spell rows, leaving system rows (ownerId: null) untouched", async () => {
    const ownerId = `spell-owner-${randomUUID()}`;
    await ensureTestOwner(ownerId);
    MADE_USERS.push(ownerId);

    const owned = await prisma.spell.create({ data: spellFixture({ ownerId }) });
    MADE_SPELLS.push(owned.id);
    const system = await prisma.spell.create({ data: spellFixture({ ownerId: null }) });
    MADE_SPELLS.push(system.id);

    await prisma.user.delete({ where: { id: ownerId } });

    expect(await prisma.spell.findUnique({ where: { id: owned.id } })).toBeNull();
    expect(await prisma.spell.findUnique({ where: { id: system.id } })).not.toBeNull();
  });

  // Regression for the widened @@unique([name, edition, ownerId]) (review
  // finding on #1789): with ownerId excluded from the key, two users
  // couldn't each homebrew a same-named spell, and a homebrew spell couldn't
  // share a name with a seeded one. NULLS NOT DISTINCT still means seeded
  // (ownerId: null) rows enforce global (name, edition) uniqueness among
  // themselves.
  it("lets two different users homebrew the same name+edition, but still rejects a second null-owner row with that name+edition", async () => {
    const ownerA = `spell-owner-${randomUUID()}`;
    const ownerB = `spell-owner-${randomUUID()}`;
    await ensureTestOwner(ownerA);
    MADE_USERS.push(ownerA);
    await ensureTestOwner(ownerB);
    MADE_USERS.push(ownerB);

    const sharedName = `Owner Fixture Shared ${randomUUID()}`;

    const fromA = await prisma.spell.create({
      data: spellFixture({ name: sharedName, edition: "EDITION_2024", ownerId: ownerA }),
    });
    MADE_SPELLS.push(fromA.id);
    const fromB = await prisma.spell.create({
      data: spellFixture({ name: sharedName, edition: "EDITION_2024", ownerId: ownerB }),
    });
    MADE_SPELLS.push(fromB.id);

    expect(fromA.id).not.toBe(fromB.id);

    const firstSystem = await prisma.spell.create({
      data: spellFixture({ name: sharedName, edition: "EDITION_2024", ownerId: null }),
    });
    MADE_SPELLS.push(firstSystem.id);

    await expect(
      prisma.spell.create({ data: spellFixture({ name: sharedName, edition: "EDITION_2024", ownerId: null }) }),
    ).rejects.toMatchObject({ code: "P2002" });
  });
});
