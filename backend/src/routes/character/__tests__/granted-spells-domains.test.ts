/**
 * Official granted spell lists (#913) — end-to-end over the SEEDED rows.
 *
 * Unlike spellcasting.test.ts (which seeds its own test subclass grant), this
 * links a character to the real seeded "Life Domain" Subclass + its ten
 * SubclassGrantedSpell rows, proving the #912 catalog expansion + #913 seed
 * content resolve through the live serialize path. Asserts the domain spells
 * surface as always-prepared, level-gated grants marked source:"subclass" (the
 * marker the prepared-cap logic excludes on).
 */

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "@/app.js";
import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";

const OWNER_ID = "owner-granted-domains";
let COOKIE: string;
const app = createApp();
const CHAR_ID = "test-granted-domains-1";

// XP thresholds (levelForExperience): L1=0, L5=6500.
const XP_LVL_1 = 0;
const XP_LVL_5 = 6500;

let clericClassId: string;
let lifeDomainId: string;

beforeAll(async () => {
  await ensureTestOwner(OWNER_ID);
  COOKIE = await authCookie(OWNER_ID);
  const cls = await prisma.characterClass.findUnique({ where: { name: "Cleric" }, select: { id: true } });
  if (!cls) throw new Error("Cleric class not seeded — run `prisma db seed` before tests");
  clericClassId = cls.id;
  const sub = await prisma.subclass.findUnique({
    where: { classId_name: { classId: clericClassId, name: "Life Domain" } },
    select: { id: true },
  });
  if (!sub) throw new Error("Life Domain subclass not seeded — run `prisma db seed` before tests");
  lifeDomainId = sub.id;
});

afterEach(async () => {
  await prisma.character.deleteMany({ where: { id: CHAR_ID } });
});

async function createLifeCleric(xp: number) {
  await prisma.character.create({
    data: {
      id: CHAR_ID,
      name: "Life Cleric",
      alignment: "Lawful Good",
      experiencePoints: xp,
      initiativeBonus: 0,
      speed: 30,
      hitPoints: { current: 30, max: 30, temp: 0 },
      hitDice: { total: 5, die: "d8" },
      abilityScores: {
        strength: 10, dexterity: 12, constitution: 14,
        intelligence: 10, wisdom: 16, charisma: 8,
      },
      savingThrowProficiencies: ["wisdom", "charisma"],
      skills: [], toolProficiencies: [],
      currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
      ownerId: OWNER_ID,
      spellcasting: { slotsUsed: {}, spells: [] } as Prisma.InputJsonValue,
      classEntries: {
        // ClassEntry.level is left at its default (1): the single-class serialize
        // path derives level from experiencePoints (the per-class column can be
        // stale), so XP alone drives the gate. A multiclass test would need to
        // set per-entry `level` — that path uses e.level, not the XP total.
        create: [{ name: "cleric", classId: clericClassId, position: 0, subclass: "life domain", subclassId: lifeDomainId }],
      },
    },
  });
}

interface GrantedSpell { name: string; level: number; source?: string; prepared?: boolean }
async function grantedSpells(): Promise<GrantedSpell[]> {
  const res = await supertest.agent(app).set("Cookie", COOKIE).get(`/api/characters/${CHAR_ID}`);
  expect(res.status).toBe(200);
  return ((res.body.spellcasting?.spells ?? []) as GrantedSpell[]).filter((s) => s.source === "subclass");
}

describe("Life Domain granted spells (#913)", () => {
  it("surfaces the level-gated domain spells at cleric level 5, always-prepared", async () => {
    await createLifeCleric(XP_LVL_5);
    const granted = await grantedSpells();
    const names = granted.map((s) => s.name).sort();
    // gate 1 (Bless/Cure Wounds), 3 (Lesser Restoration/Spiritual Weapon), 5 (Beacon of Hope/Revivify).
    expect(names).toEqual([
      "Beacon of Hope",
      "Bless",
      "Cure Wounds",
      "Lesser Restoration",
      "Revivify",
      "Spiritual Weapon",
    ]);
    // gate 7+ (Death Ward, Mass Cure Wounds, …) not yet available.
    expect(names).not.toContain("Death Ward");
    expect(names).not.toContain("Mass Cure Wounds");
    // Always-prepared grants, marked source:"subclass" (excluded from the prepared cap).
    expect(granted.every((s) => s.prepared === true && s.source === "subclass")).toBe(true);
  });

  it("gates all grants out at cleric level 1 (subclass grants at 3, #1128)", async () => {
    await createLifeCleric(XP_LVL_1);
    const names = (await grantedSpells()).map((s) => s.name).sort();
    expect(names).toEqual([]);
  });
});
