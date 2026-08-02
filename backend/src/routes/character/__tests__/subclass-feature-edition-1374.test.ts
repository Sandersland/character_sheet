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
import { loadDbFeatureRows } from "@/lib/classes/__tests__/db-feature-rows.fixture.js";

const OWNER_ID = "owner-1374-subclass-feature-edition";
let COOKIE: string;
const app = createApp();

const XP_LVL_3 = 900;

const BASE_ABILITY_SCORES = {
  strength: 10, dexterity: 12, constitution: 14, intelligence: 15, wisdom: 14, charisma: 12,
};

let lifeDomainId: string;
const warlockSubclassIds: Record<string, string> = {};

// findFirst, not findUnique: the classId_name compound-key shorthand can't
// express a null edition (#1306). No `edition` filter: most seeded subclasses
// are still edition: null (shared), but The Archfey/The Great Old One are now
// EDITION_2014-tagged (#1233 — their PHB'24 reworks are non-SRD), so this
// resolves by (classId, name) alone, same as seed.ts's own upsertGrantedSpell
// fix — correct as long as at most one Subclass row exists per name, true for
// every name this test resolves today.
async function seededSubclassId(className: string, subclassName: string): Promise<string> {
  const cls = await prisma.characterClass.findUnique({ where: { name: className }, select: { id: true } });
  if (!cls) throw new Error(`${className} class not seeded — run \`prisma db seed\` before tests`);
  const sub = await prisma.subclass.findFirst({
    where: { classId: cls.id, name: subclassName },
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

describe("2014 Cleric renders 2014 Domain Spells text; 2024 Cleric renders the real SRD 5.2 Life Domain Spells (#1374, retargeted #1225)", () => {
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

  // #1225 RETARGET: the pre-#1225 "Domain Spells" 2024 row this latch used to
  // pin byte-for-byte was FABRICATED (the PHB'14 list with its first tier
  // relabelled L1->L3, never real SRD 5.2 content) — pinning it byte-for-byte
  // was pinning a bug. The real SRD 5.2 row is a DIFFERENT NAME ("Life Domain
  // Spells", transcribed from SRD 5.2 p.40) at a DIFFERENT LEVEL (L3, not L1)
  // — retargeted here rather than left asserting fabricated text forever.
  it("a level-3 2024 Cleric's Life Domain Spells description is the real SRD 5.2 table (reverse-regression latch)", async () => {
    const id = await createCharacter("1374 Feature Ed Cleric 2024", "Cleric", "EDITION_2024");
    await setSubclass(id, "Life Domain", lifeDomainId);
    await prisma.character.update({ where: { id }, data: { experiencePoints: XP_LVL_3 } });

    const res = await get(id);
    expect(res.status).toBe(200);
    const features = res.body.resources.features as { name: string; description: string }[];
    const domainSpells = features.find((f) => f.name === "Life Domain Spells");
    expect(domainSpells?.description).toBe(
      "Always-prepared domain spells (they don't count against your prepared total): Aid, Bless, Cure Wounds, Lesser Restoration (L3); Mass Healing Word, Revivify (L5); Aura of Life, Death Ward (L7); Greater Restoration, Mass Cure Wounds (L9).",
    );
    // The stale name must not survive alongside the real one.
    expect(features.some((f) => f.name === "Domain Spells")).toBe(false);
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
    // tag to strip). #1524: DerivedFeature.edition is now ALWAYS set (every
    // row — tagged or the untagged ~256-entry default expanded to both
    // editions at seed time — carries its resolved edition), so `f.edition
    // === "EDITION_2014"` alone no longer isolates a GENUINE fork from an
    // untagged feature merely resolved at 2014. Confirm the real property
    // instead: deriveResources' 2014 row is the 2014-WORDED text (byte
    // distinct from the 2024 row) — proving the fork resolved, not merely
    // tagged. #1225: the 2014/2024 rows are two DIFFERENT NAMES now (a rename,
    // not a same-name fork), so this reads each side by its own name rather
    // than a shared "Domain Spells" lookup.
    const featureRows = await loadDbFeatureRows("cleric", "life domain");
    const info2014 = deriveResources("cleric", "life domain", 1, BASE_ABILITY_SCORES, proficiencyBonusForLevel(1), featureRows, "EDITION_2014");
    const info2024 = deriveResources("cleric", "life domain", 3, BASE_ABILITY_SCORES, proficiencyBonusForLevel(3), featureRows, "EDITION_2024");
    const domainSpells2014 = (info2014?.features ?? []).find((f) => f.name === "Domain Spells");
    const domainSpells2024 = (info2024?.features ?? []).find((f) => f.name === "Life Domain Spells");
    expect(domainSpells2014?.edition).toBe("EDITION_2014");
    expect(domainSpells2014?.description).not.toBe(domainSpells2024?.description);
  });
});

// #1233 REWRITE: the original latch pinned the 2024 "Expanded Spell List" text
// byte-identically for all three patrons — that text was #1523's unverified
// 2014-copy placeholder, and #1233 is the issue that replaced it (Fiend Spells
// for The Fiend; zero 2024 rows at all for The Archfey/Great Old One). The
// latch's WHY survives even though its content doesn't: a 2014 patron must
// still render its own SPELL-level-keyed text at its own (still level 1)
// gate, unaffected by any of this; a 2024 Fiend must render the real SRD 5.2
// Fiend Spells at its new level-3 gate; and — the regression this rewrite
// specifically guards against — a 2024 Archfey/Great Old One must render
// ZERO subclass features at all, not a stale 2014-worded copy, since neither
// patron has any EDITION_2024 ClassFeature row left (owner decision, #1233).
describe("2014 Warlock renders 2014 subclass text at its own gate; 2024 Fiend renders Fiend Spells; 2024 Archfey/GOO render nothing (#1374, #1233)", () => {
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

  it("a level-3 2024 Warlock/The Fiend renders Fiend Spells, the real SRD 5.2 rename, not Expanded Spell List", async () => {
    const id = await createCharacter("1374 Feature Ed Warlock 2024 Fiend", "Warlock", "EDITION_2024");
    await setSubclass(id, "The Fiend", warlockSubclassIds["The Fiend"]);
    await prisma.character.update({ where: { id }, data: { experiencePoints: XP_LVL_3 } });

    const res = await get(id);
    expect(res.status).toBe(200);
    const features = res.body.resources.features as { name: string; description: string }[];
    const fiendSpells = features.find((f) => f.name === "Fiend Spells");
    expect(fiendSpells?.description).toContain("Burning Hands, Command, Scorching Ray, Suggestion");
    expect(features.some((f) => f.name === "Expanded Spell List")).toBe(false);
  });

  it.each(["The Archfey", "The Great Old One"] as const)(
    "a level-14 2024 Warlock/%s renders ZERO subclass features (no 2024 content exists for either patron)",
    async (subclass) => {
      const id = await createCharacter(`1374 Feature Ed Warlock 2024 ${subclass}`, "Warlock", "EDITION_2024");
      await setSubclass(id, subclass, warlockSubclassIds[subclass]);
      await prisma.character.update({ where: { id }, data: { experiencePoints: 120000 } }); // level 14

      const res = await get(id);
      expect(res.status).toBe(200);
      const featureRows = await loadDbFeatureRows("warlock", subclass.toLowerCase());
      const subclassFeatureCount = deriveResources(
        "warlock",
        subclass.toLowerCase(),
        14,
        BASE_ABILITY_SCORES,
        proficiencyBonusForLevel(14),
        featureRows,
        "EDITION_2024",
      )?.features.filter((f) => f.source === "subclass").length;
      expect(subclassFeatureCount).toBe(0);
    },
  );

  it("no feature on the wire carries an edition tag", async () => {
    const id = await createCharacter("1374 Feature Ed Warlock Wire", "Warlock", "EDITION_2014");
    await setSubclass(id, "The Fiend", warlockSubclassIds["The Fiend"]);

    const res = await get(id);
    expect(res.status).toBe(200);
    const features = res.body.resources.features as Record<string, unknown>[];
    expect(features.every((f) => !("edition" in f))).toBe(true);

    // See the Cleric block's identical comment: #1524 makes DerivedFeature.edition
    // always-set, so the anti-vacuity control asserts the fork's TEXT differs
    // per edition rather than merely checking a tag's presence. #1233: the
    // 2024 comparison is now "Fiend Spells" (the renamed feature), not
    // "Expanded Spell List" (which no longer has a 2024 row at all).
    const featureRows = await loadDbFeatureRows("warlock", "the fiend");
    const info2014 = deriveResources("warlock", "the fiend", 1, BASE_ABILITY_SCORES, proficiencyBonusForLevel(1), featureRows, "EDITION_2014");
    const info2024 = deriveResources("warlock", "the fiend", 3, BASE_ABILITY_SCORES, proficiencyBonusForLevel(3), featureRows, "EDITION_2024");
    const expanded2014 = (info2014?.features ?? []).find((f) => f.name === "Expanded Spell List");
    const fiendSpells2024 = (info2024?.features ?? []).find((f) => f.name === "Fiend Spells");
    expect(expanded2014?.edition).toBe("EDITION_2014");
    expect(fiendSpells2024?.edition).toBe("EDITION_2024");
    expect(expanded2014?.description).not.toBe(fiendSpells2024?.description);
  });
});
