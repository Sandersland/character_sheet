/**
 * #1374: DerivedFeature.edition — Cleric (Life/Trickery Domain) and Warlock
 * (The Fiend/Archfey/Great Old One) forks. #1308/#1291 made a 2014
 * subclass correctly derive its features at level 1, but the TEXT was still
 * 2024-worded (spell tiers labelled by 2024 character level, not 2014's) —
 * #1331's worked example. This pins the 2014 fork's route-level behaviour
 * against the SEEDED catalog (never a fixture class), modelled on
 * subclass-active-edition-1291.test.ts.
 */

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "@/app.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";
import { deriveResources } from "@/lib/classes/class-features.js";
import { proficiencyBonusForLevel } from "@/lib/leveling/experience.js";

const OWNER_ID = "owner-1374-subclass-feature-edition";
let COOKIE: string;
const app = createApp();

const XP_LVL_3 = 900;

const BASE_ABILITY_SCORES = {
  strength: 10, dexterity: 12, constitution: 14, intelligence: 15, wisdom: 14, charisma: 12,
};

let lifeDomainId: string;
const warlockSubclassIds: Record<string, string> = {};

// Untagged (edition: null) row lookup — findFirst, not findUnique: the
// classId_name compound-key shorthand can't express a null edition (#1306).
async function seededSubclassId(className: string, subclassName: string): Promise<string> {
  const cls = await prisma.characterClass.findUnique({ where: { name: className }, select: { id: true } });
  if (!cls) throw new Error(`${className} class not seeded — run \`prisma db seed\` before tests`);
  const sub = await prisma.subclass.findFirst({
    where: { classId: cls.id, name: subclassName, edition: null },
    select: { id: true },
  });
  if (!sub) throw new Error(`${subclassName} subclass not seeded — run \`prisma db seed\` before tests`);
  return sub.id;
}

beforeAll(async () => {
  await ensureTestOwner(OWNER_ID);
  COOKIE = await authCookie(OWNER_ID);

  lifeDomainId = await seededSubclassId("Cleric", "Life Domain");
  warlockSubclassIds["The Fiend"] = await seededSubclassId("Warlock", "The Fiend");
  warlockSubclassIds["The Archfey"] = await seededSubclassId("Warlock", "The Archfey");
  warlockSubclassIds["The Great Old One"] = await seededSubclassId("Warlock", "The Great Old One");
});

afterEach(async () => {
  await prisma.character.deleteMany({ where: { name: { startsWith: "1374 Feature Ed" } } });
});

async function createCharacter(name: string, className: string, rulesEdition: "EDITION_2014" | "EDITION_2024") {
  const res = await supertest(app)
    .post("/api/characters")
    .set("Cookie", COOKIE)
    .send({
      name,
      alignment: "True Neutral",
      race: "Hill Dwarf",
      background: "Sage",
      classes: [{ name: className }],
      abilityScores: BASE_ABILITY_SCORES,
      rulesEdition,
    });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

async function setSubclass(characterId: string, subclass: string, subclassId: string) {
  await prisma.characterClassEntry.updateMany({
    where: { characterId },
    data: { subclass, subclassId },
  });
}

function get(id: string) {
  return supertest(app).get(`/api/characters/${id}`).set("Cookie", COOKIE);
}

describe("2014 Cleric renders 2014 Domain Spells text; 2024 Cleric text is unchanged (#1374)", () => {
  it("a level-1 2014 Cleric's Domain Spells description labels the lowest tier (L1), not (L3)", async () => {
    const id = await createCharacter("1374 Feature Ed Cleric 2014", "Cleric", "EDITION_2014");
    await setSubclass(id, "Life Domain", lifeDomainId);

    const res = await get(id);
    expect(res.status).toBe(200);
    const domainSpells = (res.body.resources.features as { name: string; description: string }[]).find(
      (f) => f.name === "Domain Spells",
    );
    expect(domainSpells?.description).toContain("Bless, Cure Wounds (L1)");
    expect(domainSpells?.description).not.toContain("Bless, Cure Wounds (L3)");
  });

  it("a level-3 2024 Cleric's Domain Spells description is byte-identical to today (reverse-regression latch)", async () => {
    const id = await createCharacter("1374 Feature Ed Cleric 2024", "Cleric", "EDITION_2024");
    await setSubclass(id, "Life Domain", lifeDomainId);
    await prisma.character.update({ where: { id }, data: { experiencePoints: XP_LVL_3 } });

    const res = await get(id);
    expect(res.status).toBe(200);
    const domainSpells = (res.body.resources.features as { name: string; description: string }[]).find(
      (f) => f.name === "Domain Spells",
    );
    expect(domainSpells?.description).toBe(
      "Always-prepared domain spells (they don't count against your prepared total): Bless, Cure Wounds (L3); Lesser Restoration, Spiritual Weapon (L3); Beacon of Hope, Revivify (L5); Death Ward, Guardian of Faith (L7); Mass Cure Wounds, Raise Dead (L9).",
    );
  });

  it("no feature on the wire carries an edition tag", async () => {
    const id = await createCharacter("1374 Feature Ed Cleric Wire", "Cleric", "EDITION_2014");
    await setSubclass(id, "Life Domain", lifeDomainId);

    const res = await get(id);
    expect(res.status).toBe(200);
    const features = res.body.resources.features as Record<string, unknown>[];
    expect(features.every((f) => !("edition" in f))).toBe(true);

    // Anti-vacuity control: without this half, the assertion above passes
    // trivially if the fork vanished entirely (no feature would ever carry a
    // tag to strip). Confirms deriveResources itself DOES tag the 2014 row —
    // the wire-level absence is toWireFeatures stripping it, not the fork
    // never existing.
    const info = deriveResources("cleric", "life domain", 1, BASE_ABILITY_SCORES, proficiencyBonusForLevel(1), "EDITION_2014");
    const tagged = (info?.features ?? []).filter((f) => f.edition === "EDITION_2014");
    expect(tagged).toHaveLength(1);
  });
});

describe("2014 Warlock renders 2014 Expanded Spell List text; 2024 patrons are unchanged (#1374)", () => {
  it("a level-1 2014 Warlock/The Fiend's Expanded Spell List is keyed by SPELL level, not warlock level", async () => {
    const id = await createCharacter("1374 Feature Ed Warlock 2014", "Warlock", "EDITION_2014");
    await setSubclass(id, "The Fiend", warlockSubclassIds["The Fiend"]);

    const res = await get(id);
    expect(res.status).toBe(200);
    const expanded = (res.body.resources.features as { name: string; description: string }[]).find(
      (f) => f.name === "Expanded Spell List",
    );
    expect(expanded?.description).toContain("Burning Hands, Command (1st)");
    expect(expanded?.description).not.toContain("(L3)");
  });

  it.each([
    ["The Fiend", "Add fiend spells to your warlock list: Burning Hands, Command (L3); Blindness/Deafness, Scorching Ray (L3); Fireball, Stinking Cloud (L5); Fire Shield, Wall of Fire (L7); Flame Strike, Hallow (L9)."],
    ["The Archfey", "Add archfey spells to your warlock list: Faerie Fire, Sleep (L3); Calm Emotions, Phantasmal Force (L3); Blink, Plant Growth (L5); Dominate Beast, Greater Invisibility (L7); Dominate Person, Seeming (L9)."],
    ["The Great Old One", "Add Great Old One spells to your warlock list: Dissonant Whispers, Hideous Laughter (L3); Detect Thoughts, Phantasmal Force (L3); Clairvoyance, Sending (L5); Dominate Beast, Black Tentacles (L7); Dominate Person, Telekinesis (L9)."],
  ])("a level-3 2024 Warlock/%s's Expanded Spell List is byte-identical to today (reverse-regression latch)", async (subclass, expected) => {
    const id = await createCharacter(`1374 Feature Ed Warlock 2024 ${subclass}`, "Warlock", "EDITION_2024");
    await setSubclass(id, subclass, warlockSubclassIds[subclass]);
    await prisma.character.update({ where: { id }, data: { experiencePoints: XP_LVL_3 } });

    const res = await get(id);
    expect(res.status).toBe(200);
    const expanded = (res.body.resources.features as { name: string; description: string }[]).find(
      (f) => f.name === "Expanded Spell List",
    );
    expect(expanded?.description).toBe(expected);
  });

  it("no feature on the wire carries an edition tag", async () => {
    const id = await createCharacter("1374 Feature Ed Warlock Wire", "Warlock", "EDITION_2014");
    await setSubclass(id, "The Fiend", warlockSubclassIds["The Fiend"]);

    const res = await get(id);
    expect(res.status).toBe(200);
    const features = res.body.resources.features as Record<string, unknown>[];
    expect(features.every((f) => !("edition" in f))).toBe(true);

    const info = deriveResources("warlock", "the fiend", 1, BASE_ABILITY_SCORES, proficiencyBonusForLevel(1), "EDITION_2014");
    const tagged = (info?.features ?? []).filter((f) => f.edition === "EDITION_2014");
    expect(tagged).toHaveLength(1);
  });
});
