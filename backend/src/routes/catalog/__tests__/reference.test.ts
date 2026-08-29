import { afterAll, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { authCookie } from "@/test-support/auth.js";
import { prisma } from "@/lib/core/prisma.js";

const OWNER_ID = "owner-reference";
let COOKIE: string;

beforeAll(async () => {
  COOKIE = await authCookie(OWNER_ID);
});

describe("GET /api/reference", () => {
  it("returns the catalog lists and alignment set used to drive character creation", async () => {
    const response = await supertest
      .agent(app)
      .set("Cookie", COOKIE)
      .get("/api/reference?edition=EDITION_2024");

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("species");
    expect(response.body).toHaveProperty("classes");
    expect(response.body).toHaveProperty("backgrounds");
    expect(response.body).toHaveProperty("alignments");

    expect(Array.isArray(response.body.species)).toBe(true);
    expect(Array.isArray(response.body.classes)).toBe(true);
    expect(Array.isArray(response.body.backgrounds)).toBe(true);
    expect(response.body.alignments).toEqual(
      expect.arrayContaining(["Lawful Good", "True Neutral", "Chaotic Evil"])
    );

    expect(response.body).toHaveProperty("artisanTools");
    expect(Array.isArray(response.body.artisanTools)).toBe(true);
    expect(response.body.artisanTools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Smith's Tools", category: "artisan" }),
      ])
    );
    expect(response.body).not.toHaveProperty("tools");
    expect(response.body.artisanTools.every((t: { category: string }) => t.category === "artisan")).toBe(true);

    const fighter = response.body.classes.find((c: { name: string }) => c.name === "Fighter");
    expect(fighter).toBeDefined();
    expect(Array.isArray(fighter.toolProficiencies)).toBe(true);
    expect(Array.isArray(fighter.toolChoices)).toBe(true);
    expect(typeof fighter.toolChoiceCount).toBe("number");

    const criminal = response.body.backgrounds.find((b: { name: string }) => b.name === "Criminal");
    expect(criminal).toBeDefined();
    expect(criminal.toolProficiencies).toEqual(["Thieves' Tools"]);
    expect(criminal.abilityChoices).toEqual(["dexterity", "constitution", "intelligence"]);
    expect(criminal.skillProficiencies).toEqual(["sleightOfHand", "stealth"]);
    expect(criminal.originFeat).toMatchObject({ name: "Alert", category: "origin" });
    expect(criminal.toolChoices).toEqual([]);
    expect(criminal.toolChoiceCount).toBe(0);

    const soldier2024 = response.body.backgrounds.find((b: { name: string }) => b.name === "Soldier");
    expect(soldier2024.toolProficiencies).toEqual([]);
    expect(soldier2024.toolChoices).toEqual(
      expect.arrayContaining(["Dice Set", "Dragonchess Set", "Playing Card Set", "Three-Dragon Ante Set"]),
    );
    expect(soldier2024.toolChoices).toHaveLength(4);
    expect(soldier2024.toolChoiceCount).toBe(1);

    const noble2024 = response.body.backgrounds.find((b: { name: string }) => b.name === "Noble");
    expect(noble2024.toolProficiencies).toEqual([]);
    expect(noble2024.toolChoiceCount).toBe(1);

    expect(response.body.backgrounds.map((b: { name: string }) => b.name)).not.toContain("Folk Hero");
  });

  it("suppresses the ability spread and origin feat for every background under EDITION_2014 (#1504, #1572)", async () => {
    const response = await supertest
      .agent(app)
      .set("Cookie", COOKIE)
      .get("/api/reference?edition=EDITION_2014");

    const criminal = response.body.backgrounds.find((b: { name: string }) => b.name === "Criminal");
    expect(criminal).toBeDefined();
    expect(criminal.abilityChoices).toEqual([]);
    expect(criminal.originFeat).toBeNull();

    const soldier = response.body.backgrounds.find((b: { name: string }) => b.name === "Soldier");
    expect(soldier).toBeDefined();
    expect(soldier.abilityChoices).toEqual([]);
    expect(soldier.originFeat).toBeNull();
    // PHB'14 Soldier grants the same gaming-set choice as PHB'24 — toolChoiceCount isn't suppressed under EDITION_2014, unlike abilityChoices/originFeat (#1779).
    expect(soldier.toolChoiceCount).toBe(1);
    expect(soldier.toolChoices).toHaveLength(4);
  });

  it("ships level1SpellPicks per class (cantrips + spells, null for non-casters)", async () => {
    const response = await supertest
      .agent(app)
      .set("Cookie", COOKIE)
      .get("/api/reference?edition=EDITION_2024");
    const byName = (name: string) => response.body.classes.find((c: { name: string }) => c.name === name);

    expect(byName("Warlock").level1SpellPicks).toEqual({ cantrips: 2, spells: 2, maxSpellLevel: 1 });
    expect(byName("Paladin").level1SpellPicks).toEqual({ cantrips: 0, spells: 2, maxSpellLevel: 1 });
    // Wizard's `spells` count is the spellbook size (6), not the prepared count (4) — spellbookSize marks the split (#1513).
    expect(byName("Wizard").level1SpellPicks).toEqual({ cantrips: 3, spells: 6, maxSpellLevel: 1, spellbookSize: 6 });
    expect(byName("Fighter").level1SpellPicks).toBeNull();

    const casters = response.body.classes.filter((c: { level1SpellPicks: unknown }) => c.level1SpellPicks !== null);
    expect(casters.length).toBeGreaterThan(0);
    for (const caster of casters) {
      expect(caster.level1SpellPicks.maxSpellLevel, caster.name).toBe(1);
    }
  });

  // PHB'14 p. 84/92 (#1507/#1508/#1510): a 2014 Paladin/Ranger has no Spellcasting until level 2, so level1SpellPicks is null.
  it("serves level1SpellPicks per the SRD 5.1 table (#1510), null for a 2014 Paladin/Ranger", async () => {
    const response = await supertest
      .agent(app)
      .set("Cookie", COOKIE)
      .get("/api/reference?edition=EDITION_2014");
    const byName = (name: string) => response.body.classes.find((c: { name: string }) => c.name === name);

    expect(byName("Bard").level1SpellPicks).toEqual({ cantrips: 2, spells: 4, maxSpellLevel: 1 });
    expect(byName("Sorcerer").level1SpellPicks).toEqual({ cantrips: 4, spells: 2, maxSpellLevel: 1 });
    expect(byName("Warlock").level1SpellPicks).toEqual({ cantrips: 2, spells: 2, maxSpellLevel: 1 });
    expect(byName("Wizard").level1SpellPicks).toEqual({ cantrips: 3, spells: 6, maxSpellLevel: 1, spellbookSize: 6 });
    // SRD 5.1 Cleric/Druid prepare from the full class list, so 0 spells, cantrips only, maxSpellLevel 0 (#1510).
    expect(byName("Cleric").level1SpellPicks).toEqual({ cantrips: 3, spells: 0, maxSpellLevel: 0 });
    expect(byName("Druid").level1SpellPicks).toEqual({ cantrips: 2, spells: 0, maxSpellLevel: 0 });
    expect(byName("Paladin").level1SpellPicks).toBeNull();
    expect(byName("Ranger").level1SpellPicks).toBeNull();
  });

  it("spellbookSize is 6 for Wizard in both editions; Bard/Cleric/Fighter are byte-identical (#1513)", async () => {
    const res2024 = await supertest.agent(app).set("Cookie", COOKIE).get("/api/reference?edition=EDITION_2024");
    const res2014 = await supertest.agent(app).set("Cookie", COOKIE).get("/api/reference?edition=EDITION_2014");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- response.body is untyped JSON (supertest), matching this file's existing byName helpers
    const byName = (body: any, name: string) => body.classes.find((c: { name: string }) => c.name === name);

    expect(byName(res2024.body, "Wizard").level1SpellPicks).toEqual({
      cantrips: 3, spells: 6, maxSpellLevel: 1, spellbookSize: 6,
    });
    expect(byName(res2014.body, "Wizard").level1SpellPicks).toEqual({
      cantrips: 3, spells: 6, maxSpellLevel: 1, spellbookSize: 6,
    });

    expect(byName(res2024.body, "Bard").level1SpellPicks).toEqual({ cantrips: 2, spells: 4, maxSpellLevel: 1 });
    expect(byName(res2024.body, "Cleric").level1SpellPicks).toEqual({ cantrips: 3, spells: 4, maxSpellLevel: 1 });
    expect(byName(res2024.body, "Fighter").level1SpellPicks).toBeNull();

    expect(byName(res2014.body, "Bard").level1SpellPicks).toEqual({ cantrips: 2, spells: 4, maxSpellLevel: 1 });
    expect(byName(res2014.body, "Cleric").level1SpellPicks).toEqual({ cantrips: 3, spells: 0, maxSpellLevel: 0 });
    expect(byName(res2014.body, "Fighter").level1SpellPicks).toBeNull();
  });

  it("ships primaryAbility per class", async () => {
    const response = await supertest
      .agent(app)
      .set("Cookie", COOKIE)
      .get("/api/reference?edition=EDITION_2024");
    const byName = (name: string) => response.body.classes.find((c: { name: string }) => c.name === name);
    expect(byName("Wizard").primaryAbility).toEqual(["intelligence"]);
    expect(byName("Fighter").primaryAbility).toEqual(["strength", "dexterity"]);
  });

  // subclassGateLevel resolves for the REQUESTED edition, not a baked-in default: PHB'14 per-class gate vs flat 3 for SRD 5.2 (#1325).
  it("resolves subclassGateLevel for the requested edition (2014 per-class gate vs 2024's flat 3)", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- response.body is untyped JSON (supertest), matching this file's existing byName helpers
    const byName = (body: any, name: string) => body.classes.find((c: { name: string }) => c.name === name);

    const res2014 = await supertest.agent(app).set("Cookie", COOKIE).get("/api/reference?edition=EDITION_2014");
    expect(res2014.status).toBe(200);
    expect(byName(res2014.body, "Cleric").subclassGateLevel).toBe(1);
    expect(byName(res2014.body, "Sorcerer").subclassGateLevel).toBe(1);
    expect(byName(res2014.body, "Warlock").subclassGateLevel).toBe(1);
    expect(byName(res2014.body, "Druid").subclassGateLevel).toBe(2);
    expect(byName(res2014.body, "Wizard").subclassGateLevel).toBe(2);
    expect(byName(res2014.body, "Fighter").subclassGateLevel).toBe(3);

    const res2024 = await supertest.agent(app).set("Cookie", COOKIE).get("/api/reference?edition=EDITION_2024");
    expect(res2024.status).toBe(200);
    expect(byName(res2024.body, "Cleric").subclassGateLevel).toBe(3);
    expect(byName(res2024.body, "Sorcerer").subclassGateLevel).toBe(3);
    expect(byName(res2024.body, "Warlock").subclassGateLevel).toBe(3);
    expect(byName(res2024.body, "Druid").subclassGateLevel).toBe(3);
    expect(byName(res2024.body, "Wizard").subclassGateLevel).toBe(3);
    expect(byName(res2024.body, "Fighter").subclassGateLevel).toBe(3);
  });

  it("400s on an unrecognized edition", async () => {
    const response = await supertest
      .agent(app)
      .set("Cookie", COOKIE)
      .get("/api/reference?edition=EDITION_1974");
    expect(response.status).toBe(400);
    expect(response.body.error).toContain("EDITION_1974");
  });

  it("400s when edition is omitted", async () => {
    const response = await supertest.agent(app).set("Cookie", COOKIE).get("/api/reference");
    expect(response.status).toBe(400);
    expect(response.body.error).toContain("edition");
  });

  // originFeatId is resolved BY NAME through resolveEditionCatalog, matching what buildOriginEntry actually grants a character (#1348/#1504).
  it("resolves a background's origin feat for the requested edition, null under 2014 (#1348, #1504)", async () => {
    const criminal2014 = await supertest.agent(app).set("Cookie", COOKIE).get("/api/reference?edition=EDITION_2014");
    const criminal2024 = await supertest.agent(app).set("Cookie", COOKIE).get("/api/reference?edition=EDITION_2024");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- response.body is untyped JSON (supertest), matching this file's existing byName helpers
    const byName = (body: any, name: string) => body.backgrounds.find((b: { name: string }) => b.name === name);

    const alert2024 = byName(criminal2024.body, "Criminal").originFeat;
    expect(alert2024.name).toBe("Alert");
    expect(alert2024.description).toMatch(/Proficiency Bonus/);

    // `edition` drives resolveEditionCatalog only — it must not ride along on the wire (OriginFeatOption's four fields).
    expect(Object.keys(alert2024).sort()).toEqual(["category", "description", "id", "name"]);

    expect(byName(criminal2014.body, "Criminal").originFeat).toBeNull();

    expect(byName(criminal2014.body, "Folk Hero").originFeat).toBeNull();
    expect(byName(criminal2024.body, "Folk Hero")).toBeUndefined();

    // Gate is on the REQUESTING edition, not on whether the feat row itself is edition-tagged (Savage Attacker is tagged both ways, #1310).
    expect(byName(criminal2014.body, "Soldier").originFeat).toBeNull();
    expect(byName(criminal2024.body, "Soldier").originFeat.name).toBe("Savage Attacker");
  });

  it("ships conditions resolved for the requested edition (#1322)", async () => {
    const res2014 = await supertest.agent(app).set("Cookie", COOKIE).get("/api/reference?edition=EDITION_2014");
    const res2024 = await supertest.agent(app).set("Cookie", COOKIE).get("/api/reference?edition=EDITION_2024");
    expect(res2014.status).toBe(200);
    expect(res2024.status).toBe(200);

    expect(res2014.body.conditions).toHaveLength(14);
    expect(res2024.body.conditions).toHaveLength(14);

    // rollEffects never reaches the wire — shipping raw grants would ship the rule.
    for (const row of res2024.body.conditions) {
      expect(Object.keys(row).sort()).toEqual(["description", "key", "label"]);
    }

    expect(res2024.body.conditions[0]).toMatchObject({ key: "blinded", label: "Blinded" });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- response.body is untyped JSON (supertest), matching this file's existing byName helpers
    const findCond = (body: any, key: string) => body.conditions.find((c: { key: string }) => c.key === key);
    const grappled2014 = findCond(res2014.body, "grappled");
    const grappled2024 = findCond(res2024.body, "grappled");
    expect(grappled2014.label).toBe("Grappled");
    expect(grappled2014.description).toContain("The condition ends if the grappler is incapacitated");
    expect(grappled2024.description).toContain("other than the grappler");

    expect(findCond(res2014.body, "incapacitated").description).toBe("Can't take actions or reactions.");

    expect(findCond(res2014.body, "poisoned").description).toBe(findCond(res2024.body, "poisoned").description);
  });

  it("ships universal actions resolved for the requested edition (#1430)", async () => {
    const res2014 = await supertest.agent(app).set("Cookie", COOKIE).get("/api/reference?edition=EDITION_2014");
    const res2024 = await supertest.agent(app).set("Cookie", COOKIE).get("/api/reference?edition=EDITION_2024");
    expect(res2014.status).toBe(200);
    expect(res2024.status).toBe(200);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- response.body is untyped JSON (supertest), matching this file's existing byName helpers
    const byKey = (body: any, key: string) => body.universalActions.find((a: { key: string }) => a.key === key);
    const keys = (body: { universalActions: { key: string }[] }) => body.universalActions.map((a) => a.key);

    expect(keys(res2024.body)).toContain("study");
    expect(keys(res2024.body)).toContain("influence");
    expect(keys(res2014.body)).not.toContain("study");
    expect(keys(res2014.body)).not.toContain("influence");

    // `key` is edition-stable identity; only name/description fork.
    expect(byKey(res2024.body, "useObject").name).toBe("Utilize");
    expect(byKey(res2014.body, "useObject").name).toBe("Use an Object");
    expect(byKey(res2024.body, "castSpell").name).toBe("Magic");
    expect(byKey(res2014.body, "castSpell").name).toBe("Cast a Spell");

    // `edition` must not reach the wire.
    for (const row of [...res2024.body.universalActions, ...res2014.body.universalActions]) {
      expect(Object.keys(row).sort()).toEqual(["cost", "description", "key", "name"]);
    }

    // Ordered by NAME after resolution, not by the underlying findMany.
    const names2024: string[] = res2024.body.universalActions.map((a: { name: string }) => a.name);
    expect(names2024).toEqual([...names2024].sort((a, b) => a.localeCompare(b)));
    expect(names2024).toContain("Magic");

    for (const key of ["grapple", "shove"]) {
      expect(byKey(res2014.body, key).description).toContain("Strength (Athletics) check contested by");
      expect(byKey(res2024.body, key).description).toContain(
        "Strength or Dexterity saving throw (it chooses which)",
      );
      expect(byKey(res2024.body, key).description).toContain("8 plus your Strength modifier and Proficiency Bonus");
      expect(byKey(res2024.body, key).description).not.toContain("Athletics");
    }

    const costs = (body: { universalActions: { cost: string }[] }) =>
      [...new Set(body.universalActions.map((a) => a.cost))].sort();
    expect(costs(res2014.body)).toEqual(["action", "bonusAction", "reaction"]);
    expect(costs(res2024.body)).toEqual(["action", "bonusAction", "reaction"]);
  });

  // Edition-invariant — the last assertion fails if ITEM_RARITIES is ever routed through resolveEditionCatalog (#1437).
  it("ships the item rarity tiers, identically for both editions (#1437)", async () => {
    const res2014 = await supertest.agent(app).set("Cookie", COOKIE).get("/api/reference?edition=EDITION_2014");
    const res2024 = await supertest.agent(app).set("Cookie", COOKIE).get("/api/reference?edition=EDITION_2024");
    expect(res2014.status).toBe(200);
    expect(res2024.status).toBe(200);

    expect(res2024.body.itemRarities.map((r: { key: string }) => r.key)).toEqual([
      "COMMON",
      "UNCOMMON",
      "RARE",
      "VERY_RARE",
      "LEGENDARY",
      "ARTIFACT",
    ]);
    expect(res2024.body.itemRarities.map((r: { standardValueGp: number | null }) => r.standardValueGp)).toEqual([
      100, 400, 4000, 40000, 200000, null,
    ]);
    expect(res2024.body.itemRarities[3]).toEqual({ key: "VERY_RARE", label: "Very Rare", standardValueGp: 40000 });
    for (const row of res2024.body.itemRarities) {
      expect(Object.keys(row).sort()).toEqual(["key", "label", "standardValueGp"]);
    }

    expect(res2024.body.itemRarities).toEqual(res2014.body.itemRarities);
  });

  // Mirrors crossEditionRejection's write-path rejection — the read path must not offer what the write path refuses (#1336, until #1559).
  describe("edition-scoping backgrounds and subclasses (#1336)", () => {
    const FIGHTER = "Fighter";
    const FORKED_SUBCLASS = "Zzz Fixture Forked Subclass (#1336)";
    const SHARED_SUBCLASS = "Zzz Fixture Shared Subclass (#1336)";
    const EXACT_OVER_SHARED_SUBCLASS = "Zzz Fixture Exact-over-Shared Subclass (#1336)";
    const ONLY_2014_SUBCLASS = "Zzz Fixture 2014-Only Subclass (#1336)";
    const SUBCLASS_NAMES = [FORKED_SUBCLASS, SHARED_SUBCLASS, EXACT_OVER_SHARED_SUBCLASS, ONLY_2014_SUBCLASS];

    const FORKED_BACKGROUND = "Zzz Fixture Forked Background (#1336)";
    const SHARED_BACKGROUND = "Zzz Fixture Shared Background (#1336)";
    const EXACT_OVER_SHARED_BACKGROUND = "Zzz Fixture Exact-over-Shared Background (#1336)";
    const ONLY_2014_BACKGROUND = "Zzz Fixture 2014-Only Background (#1336)";
    const BACKGROUND_NAMES = [
      FORKED_BACKGROUND,
      SHARED_BACKGROUND,
      EXACT_OVER_SHARED_BACKGROUND,
      ONLY_2014_BACKGROUND,
    ];

    beforeAll(async () => {
      const fighter = await prisma.characterClass.findUniqueOrThrow({ where: { name: FIGHTER } });

      await prisma.subclass.createMany({
        data: [
          {
            classId: fighter.id,
            name: FORKED_SUBCLASS,
            description: "2014 fork text",
            slug: "zzz-fixture-forked-2014-1336",
            edition: "EDITION_2014",
          },
          {
            classId: fighter.id,
            name: FORKED_SUBCLASS,
            description: "2024 fork text",
            slug: "zzz-fixture-forked-2024-1336",
            edition: "EDITION_2024",
          },
          {
            classId: fighter.id,
            name: SHARED_SUBCLASS,
            description: "shared text",
            slug: "zzz-fixture-shared-1336",
            edition: null,
          },
          {
            classId: fighter.id,
            name: EXACT_OVER_SHARED_SUBCLASS,
            description: "shared fallback text",
            slug: "zzz-fixture-exact-shared-fallback-1336",
            edition: null,
          },
          {
            classId: fighter.id,
            name: EXACT_OVER_SHARED_SUBCLASS,
            description: "2014 exact text",
            slug: "zzz-fixture-exact-shared-exact-1336",
            edition: "EDITION_2014",
          },
          {
            classId: fighter.id,
            name: ONLY_2014_SUBCLASS,
            description: "2014-only text",
            slug: "zzz-fixture-only-2014-1336",
            edition: "EDITION_2014",
          },
        ],
      });

      await prisma.background.createMany({
        data: [
          { name: FORKED_BACKGROUND, skillProficiencies: [], toolProficiencies: ["2014 fork tool"], edition: "EDITION_2014" },
          { name: FORKED_BACKGROUND, skillProficiencies: [], toolProficiencies: ["2024 fork tool"], edition: "EDITION_2024" },
          { name: SHARED_BACKGROUND, skillProficiencies: [], toolProficiencies: ["shared tool"], edition: null },
          {
            name: EXACT_OVER_SHARED_BACKGROUND,
            skillProficiencies: [],
            toolProficiencies: ["shared fallback tool"],
            edition: null,
          },
          {
            name: EXACT_OVER_SHARED_BACKGROUND,
            skillProficiencies: [],
            toolProficiencies: ["2014 exact tool"],
            edition: "EDITION_2014",
          },
          {
            name: ONLY_2014_BACKGROUND,
            skillProficiencies: [],
            toolProficiencies: ["2014-only tool"],
            edition: "EDITION_2014",
          },
        ],
      });
    });

    afterAll(async () => {
      await prisma.subclass.deleteMany({ where: { name: { in: SUBCLASS_NAMES } } });
      await prisma.background.deleteMany({ where: { name: { in: BACKGROUND_NAMES } } });
    });

    async function fetchBoth() {
      const res2014 = await supertest.agent(app).set("Cookie", COOKIE).get("/api/reference?edition=EDITION_2014");
      const res2024 = await supertest.agent(app).set("Cookie", COOKIE).get("/api/reference?edition=EDITION_2024");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- response.body is untyped JSON (supertest), matching this file's existing byName helpers
      const fighterOf = (body: any) => body.classes.find((c: { name: string }) => c.name === FIGHTER);
      return { res2014, res2024, fighter2014: fighterOf(res2014.body), fighter2024: fighterOf(res2024.body) };
    }

    it("returns the exact-edition fixture subclass and excludes the other edition's fork", async () => {
      const { fighter2014, fighter2024 } = await fetchBoth();

      const forked2014 = fighter2014.subclasses.filter((s: { name: string }) => s.name === FORKED_SUBCLASS);
      const forked2024 = fighter2024.subclasses.filter((s: { name: string }) => s.name === FORKED_SUBCLASS);

      expect(forked2014).toHaveLength(1);
      expect(forked2014[0].description).toBe("2014 fork text");
      expect(forked2024).toHaveLength(1);
      expect(forked2024[0].description).toBe("2024 fork text");
    });

    // withEditionOrShared's contract: a null-edition row is not exclusive to either edition.
    it("returns a shared (edition: null) subclass and background to both editions", async () => {
      const { res2014, res2024, fighter2014, fighter2024 } = await fetchBoth();

      const shared2014 = fighter2014.subclasses.filter((s: { name: string }) => s.name === SHARED_SUBCLASS);
      const shared2024 = fighter2024.subclasses.filter((s: { name: string }) => s.name === SHARED_SUBCLASS);
      expect(shared2014).toHaveLength(1);
      expect(shared2024).toHaveLength(1);
      expect(shared2014[0].description).toBe("shared text");
      expect(shared2024[0].description).toBe("shared text");

      const bg2014 = res2014.body.backgrounds.find((b: { name: string }) => b.name === SHARED_BACKGROUND);
      const bg2024 = res2024.body.backgrounds.find((b: { name: string }) => b.name === SHARED_BACKGROUND);
      expect(bg2014).toBeDefined();
      expect(bg2024).toBeDefined();
      expect(bg2014.toolProficiencies).toEqual(["shared tool"]);
      expect(bg2024.toolProficiencies).toEqual(["shared tool"]);
    });

    // resolveEditionCatalog: an exact-edition row must win over a same-name shared twin, not merely coexist.
    it("resolves the exact-edition row over a shared same-name twin", async () => {
      const { res2014, res2024, fighter2014, fighter2024 } = await fetchBoth();

      const exact2014 = fighter2014.subclasses.filter(
        (s: { name: string }) => s.name === EXACT_OVER_SHARED_SUBCLASS,
      );
      const exact2024 = fighter2024.subclasses.filter(
        (s: { name: string }) => s.name === EXACT_OVER_SHARED_SUBCLASS,
      );
      expect(exact2014).toHaveLength(1);
      expect(exact2014[0].description).toBe("2014 exact text");
      expect(exact2024).toHaveLength(1);
      expect(exact2024[0].description).toBe("shared fallback text");

      const bg2014 = res2014.body.backgrounds.find((b: { name: string }) => b.name === EXACT_OVER_SHARED_BACKGROUND);
      const bg2024 = res2024.body.backgrounds.find((b: { name: string }) => b.name === EXACT_OVER_SHARED_BACKGROUND);
      expect(bg2014.toolProficiencies).toEqual(["2014 exact tool"]);
      expect(bg2024.toolProficiencies).toEqual(["shared fallback tool"]);
    });

    // resolveEditionRow: a row tagged for the other edition with no shared twin is simply absent.
    it("omits a subclass or background tagged only for the other edition", async () => {
      const { res2014, res2024, fighter2014, fighter2024 } = await fetchBoth();

      const only2014in2014 = fighter2014.subclasses.filter((s: { name: string }) => s.name === ONLY_2014_SUBCLASS);
      const only2014in2024 = fighter2024.subclasses.filter((s: { name: string }) => s.name === ONLY_2014_SUBCLASS);
      expect(only2014in2014).toHaveLength(1);
      expect(only2014in2024).toHaveLength(0);

      expect(res2014.body.backgrounds.find((b: { name: string }) => b.name === ONLY_2014_BACKGROUND)).toBeDefined();
      expect(
        res2024.body.backgrounds.find((b: { name: string }) => b.name === ONLY_2014_BACKGROUND),
      ).toBeUndefined();
    });

    it("never puts edition on the wire for a subclass or background object", async () => {
      const { res2014, res2024, fighter2014, fighter2024 } = await fetchBoth();

      for (const s of [...fighter2014.subclasses, ...fighter2024.subclasses]) {
        expect(Object.keys(s).sort()).toEqual(["description", "id", "name"]);
      }
      for (const b of [...res2014.body.backgrounds, ...res2024.body.backgrounds]) {
        expect(Object.keys(b).sort()).toEqual([
          "abilityChoices",
          "id",
          "name",
          "originFeat",
          "skillProficiencies",
          "startingEquipment",
          "toolChoiceCount",
          "toolChoices",
          "toolProficiencies",
        ]);
      }
    });
  });

  // SRD 5.1 ships equipment packages only for Acolyte; the rest are unscoped, so 2014 Charlatan/Criminal/Noble/Sage/Soldier serve null (#1565).
  describe("background starting-equipment (#1565)", () => {
    it("each EDITION_2024 background carries its own option-A GP and a null package-level gold", async () => {
      const response = await supertest
        .agent(app)
        .set("Cookie", COOKIE)
        .get("/api/reference?edition=EDITION_2024");
      const byName = (name: string) =>
        response.body.backgrounds.find((b: { name: string }) => b.name === name);

      // Charlatan/Noble are PHB'24 rather than SRD 5.2 (#1570); the rest are SRD 5.2.
      const expectedGoldA: Record<string, number> = {
        Acolyte: 8,
        Criminal: 16,
        Sage: 8,
        Soldier: 14,
        Charlatan: 15,
        Noble: 29,
      };
      for (const [name, goldA] of Object.entries(expectedGoldA)) {
        const bg = byName(name);
        expect(bg.startingEquipment, `${name} 2024`).not.toBeNull();
        expect(bg.startingEquipment.gold).toBeNull();
        const options = bg.startingEquipment.groups[0].options;
        expect(options[0].gold, `${name} option A gold`).toBe(goldA);
        expect(options[1]).toEqual({ label: "(B) 50 GP", gold: 50 });
      }

      // Folk Hero isn't served under 2024 at all — asserted as absence, not a null package (#1570).
      expect(byName("Folk Hero"), "Folk Hero 2024").toBeUndefined();
    });

    it("EDITION_2014 Acolyte and Folk Hero carry their fixed one-option lists; every other background is null", async () => {
      const response = await supertest
        .agent(app)
        .set("Cookie", COOKIE)
        .get("/api/reference?edition=EDITION_2014");
      const byName = (name: string) =>
        response.body.backgrounds.find((b: { name: string }) => b.name === name);

      const acolyte = byName("Acolyte");
      expect(acolyte.startingEquipment).not.toBeNull();
      expect(acolyte.startingEquipment.gold).toBeNull();
      expect(acolyte.startingEquipment.groups).toHaveLength(1);
      expect(acolyte.startingEquipment.groups[0].options).toHaveLength(1);
      expect(acolyte.startingEquipment.groups[0].options[0].gold).toBe(15);

      // PHB'14 Folk Hero's open pick is unbound, unlike Soldier's/Noble's gaming-set choice — toolCategory pins the dropdown to the seventeen artisan Items (#1570).
      const folkHero = byName("Folk Hero");
      expect(folkHero.startingEquipment).not.toBeNull();
      expect(folkHero.startingEquipment.gold).toBeNull();
      expect(folkHero.startingEquipment.groups).toHaveLength(1);
      const folkHeroOption = folkHero.startingEquipment.groups[0].options[0];
      expect(folkHero.startingEquipment.groups[0].options).toHaveLength(1);
      expect(folkHeroOption.items.map((i: { catalogName: string }) => i.catalogName)).toEqual([
        "Shovel",
        "Iron Pot",
        "Common Clothes",
      ]);
      expect(folkHeroOption.gold).toBe(10);
      expect(folkHeroOption.openPicks).toHaveLength(1);
      expect(folkHeroOption.openPicks[0].filter.toolCategory).toBe("artisan");
      expect(folkHeroOption.openPicks[0].boundToToolChoice).toBeUndefined();

      for (const name of ["Charlatan", "Criminal", "Noble", "Sage", "Soldier"]) {
        expect(byName(name).startingEquipment, `${name} 2014`).toBeNull();
      }
    });
  });

  // CharacterClass carries no edition column — subclassGateLevel/subclasses/startingEquipment/level1SpellPicks are the genuinely edition-divergent fields; every other field must stay identical (#1308/#1535/#1507).
  it("classes (apart from subclassGateLevel/subclasses/startingEquipment/level1SpellPicks) are identical between editions (#1308/#1535/#1507)", async () => {
    const res2014 = await supertest.agent(app).set("Cookie", COOKIE).get("/api/reference?edition=EDITION_2014");
    const res2024 = await supertest.agent(app).set("Cookie", COOKIE).get("/api/reference?edition=EDITION_2024");

    const stripEditionDivergentFields = (c: Record<string, unknown>) => {
      const rest = { ...c };
      delete rest.subclassGateLevel;
      delete rest.subclasses;
      delete rest.startingEquipment;
      delete rest.level1SpellPicks;
      return rest;
    };
    expect(res2014.body.classes.map(stripEditionDivergentFields)).toEqual(
      res2024.body.classes.map(stripEditionDivergentFields),
    );
  });

  // SRD 5.2 replaces Path of the Totem Warrior with Path of the Wild Heart, so a 2024 Barbarian must not see a subclass with zero features in its own edition (#1559).
  it("no longer offers the real Path of the Totem Warrior to a 2024 Barbarian, but still offers it to a 2014 one (#1559)", async () => {
    const res2014 = await supertest.agent(app).set("Cookie", COOKIE).get("/api/reference?edition=EDITION_2014");
    const res2024 = await supertest.agent(app).set("Cookie", COOKIE).get("/api/reference?edition=EDITION_2024");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- response.body is untyped JSON (supertest), matching this file's existing byName helpers
    const barbarianOf = (body: any) => body.classes.find((c: { name: string }) => c.name === "Barbarian");

    const barbarian2014 = barbarianOf(res2014.body);
    const barbarian2024 = barbarianOf(res2024.body);
    expect(barbarian2014).toBeDefined();
    expect(barbarian2024).toBeDefined();

    const totemWarrior2014 = barbarian2014.subclasses.find((s: { name: string }) => s.name === "Totem Warrior");
    const totemWarrior2024 = barbarian2024.subclasses.find((s: { name: string }) => s.name === "Totem Warrior");
    expect(totemWarrior2014).toBeDefined();
    expect(totemWarrior2024).toBeUndefined();

    // Berserker (edition: null, shared) still appears for both — confirms only Totem Warrior is absent, not every subclass.
    expect(barbarian2024.subclasses.map((s: { name: string }) => s.name)).toContain("Berserker");
  });
});
