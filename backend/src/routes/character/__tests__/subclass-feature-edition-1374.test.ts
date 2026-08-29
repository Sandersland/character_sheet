import { afterEach, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";
import { deriveResources } from "@/lib/classes/class-features.js";
import { proficiencyBonusForLevel } from "@/lib/leveling/experience.js";
import { loadDbFeatureRows } from "@/lib/classes/__tests__/db-feature-rows.fixture.js";
import { seededSpeciesAnchor } from "@/test-support/species.js";

const OWNER_ID = "owner-1374-subclass-feature-edition";
let COOKIE: string;

const XP_LVL_3 = 900;

const BASE_ABILITY_SCORES = {
  strength: 10, dexterity: 12, constitution: 14, intelligence: 15, wisdom: 14, charisma: 12,
};

let lifeDomainId: string;
const warlockSubclassIds: Record<string, string> = {};

// findFirst, not findUnique — the classId_name compound key can't express a null edition (#1306); resolves by (classId, name) alone, correct as long as at most one Subclass row exists per name.
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
  const anchor = await seededSpeciesAnchor(rulesEdition);
  const res = await supertest(app)
    .post("/api/characters")
    .set("Cookie", COOKIE)
    .send({
      name,
      alignment: "True Neutral",
      ...anchor,
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

  // The real SRD 5.2 row is "Life Domain Spells" (not "Domain Spells") at L3, transcribed from SRD 5.2 p.40 — not the old fabricated PHB'14 copy relabelled L1→L3.
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

    // Anti-vacuity: DerivedFeature.edition is always set now (#1524), so this confirms the fork by comparing deriveResources' distinct 2014/2024 text, not just a tag's presence; the 2014/2024 rows are different names now (#1225), so each side is looked up by its own name.
    const featureRows = await loadDbFeatureRows("cleric", "life domain");
    const info2014 = deriveResources("cleric", "life domain", 1, BASE_ABILITY_SCORES, proficiencyBonusForLevel(1), featureRows, "EDITION_2014");
    const info2024 = deriveResources("cleric", "life domain", 3, BASE_ABILITY_SCORES, proficiencyBonusForLevel(3), featureRows, "EDITION_2024");
    const domainSpells2014 = (info2014?.features ?? []).find((f) => f.name === "Domain Spells");
    const domainSpells2024 = (info2024?.features ?? []).find((f) => f.name === "Life Domain Spells");
    expect(domainSpells2014?.edition).toBe("EDITION_2014");
    expect(domainSpells2014?.description).not.toBe(domainSpells2024?.description);
  });
});

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

    // Anti-vacuity: DerivedFeature.edition is always set (#1524), so this confirms the fork via distinct text — 2024 here compares against "Fiend Spells" (#1233's rename), not "Expanded Spell List".
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
