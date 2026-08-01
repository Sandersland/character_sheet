import { afterAll, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "@/app.js";
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
      .agent(createApp())
      .set("Cookie", COOKIE)
      .get("/api/reference?edition=EDITION_2024");

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("races");
    expect(response.body).toHaveProperty("classes");
    expect(response.body).toHaveProperty("backgrounds");
    expect(response.body).toHaveProperty("alignments");

    expect(Array.isArray(response.body.races)).toBe(true);
    expect(Array.isArray(response.body.classes)).toBe(true);
    expect(Array.isArray(response.body.backgrounds)).toBe(true);
    expect(response.body.alignments).toEqual(
      expect.arrayContaining(["Lawful Good", "True Neutral", "Chaotic Evil"])
    );

    // Artisan tools — the flat list feeding the sheet's Proficiencies-card dropdown.
    expect(response.body).toHaveProperty("artisanTools");
    expect(Array.isArray(response.body.artisanTools)).toBe(true);
    expect(response.body.artisanTools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Smith's Tools", category: "artisan" }),
      ])
    );
    // Only artisan tools ship — the duplicate all/byCategory payload is gone.
    expect(response.body).not.toHaveProperty("tools");
    expect(response.body.artisanTools.every((t: { category: string }) => t.category === "artisan")).toBe(true);

    // Classes expose tool proficiency fields.
    const fighter = response.body.classes.find((c: { name: string }) => c.name === "Fighter");
    expect(fighter).toBeDefined();
    expect(Array.isArray(fighter.toolProficiencies)).toBe(true);
    expect(Array.isArray(fighter.toolChoices)).toBe(true);
    expect(typeof fighter.toolChoiceCount).toBe("number");

    // Backgrounds expose granted tool profs + the 2024 ability spread + Origin feat (#1130).
    const criminal = response.body.backgrounds.find((b: { name: string }) => b.name === "Criminal");
    expect(criminal).toBeDefined();
    expect(criminal.toolProficiencies).toEqual(["Thieves' Tools"]);
    expect(criminal.abilityChoices).toEqual(["dexterity", "constitution", "intelligence"]);
    expect(criminal.skillProficiencies).toEqual(["sleightOfHand", "stealth"]);
    expect(criminal.originFeat).toMatchObject({ name: "Alert", category: "origin" });

    // Folk Hero has no 2024 spec — spec-less legacy row kept (#1130).
    const folkHero = response.body.backgrounds.find((b: { name: string }) => b.name === "Folk Hero");
    expect(folkHero).toBeDefined();
    expect(folkHero.abilityChoices).toEqual([]);
    expect(folkHero.originFeat).toBeNull();
  });

  // #1131: each class carries its level-1 creation pick counts (or null for a
  // non-caster) so the frontend never re-encodes the SRD 5.2 tables.
  it("ships level1SpellPicks per class (cantrips + spells, null for non-casters)", async () => {
    const response = await supertest
      .agent(createApp())
      .set("Cookie", COOKIE)
      .get("/api/reference?edition=EDITION_2024");
    const byName = (name: string) => response.body.classes.find((c: { name: string }) => c.name === name);

    expect(byName("Warlock").level1SpellPicks).toEqual({ cantrips: 2, spells: 2, maxSpellLevel: 1 });
    expect(byName("Paladin").level1SpellPicks).toEqual({ cantrips: 0, spells: 2, maxSpellLevel: 1 });
    expect(byName("Wizard").level1SpellPicks).toEqual({ cantrips: 3, spells: 4, maxSpellLevel: 1 });
    expect(byName("Fighter").level1SpellPicks).toBeNull();

    // #1377: maxSpellLevel replaces the client's hardcoded 1. It resolves to 1 for
    // EVERY seeded class that reaches this branch — full casters, half-casters and
    // Pact Magic alike — so this locks provenance, not variation. Its value is
    // that the picker now sends a served number as ?maxLevel= instead of a literal.
    const casters = response.body.classes.filter((c: { level1SpellPicks: unknown }) => c.level1SpellPicks !== null);
    expect(casters.length).toBeGreaterThan(0);
    for (const caster of casters) {
      expect(caster.level1SpellPicks.maxSpellLevel, caster.name).toBe(1);
    }
  });

  // #1161: each class carries its PHB'24 primary ability/abilities so the
  // creation ability panel can flag recommended rows without re-encoding the rules.
  it("ships primaryAbility per class", async () => {
    const response = await supertest
      .agent(createApp())
      .set("Cookie", COOKIE)
      .get("/api/reference?edition=EDITION_2024");
    const byName = (name: string) => response.body.classes.find((c: { name: string }) => c.name === name);
    expect(byName("Wizard").primaryAbility).toEqual(["intelligence"]);
    expect(byName("Fighter").primaryAbility).toEqual(["strength", "dexterity"]);
  });

  // #1325: `?edition=` resolves subclassGateLevel (wire field, renamed from the
  // raw-column-shaped `subclassLevel`) through subclassGateLevel (the rule
  // function) for the REQUESTED edition, not a baked-in default — 2014 exposes
  // each class's real PHB'14 gate (Cleric/Sorcerer/Warlock 1, Druid/Wizard 2,
  // rest 3); 2024 flattens every class to 3 (SRD 5.2).
  it("resolves subclassGateLevel for the requested edition (2014 per-class gate vs 2024's flat 3)", async () => {
    const app = createApp();
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
      .agent(createApp())
      .set("Cookie", COOKIE)
      .get("/api/reference?edition=EDITION_1974");
    expect(response.status).toBe(400);
    expect(response.body.error).toContain("EDITION_1974");
  });

  // #1325 (C4): edition is required in the final state — an omitted-edition
  // default IS the hardcode this issue removes, so a caller that forgets it
  // gets a 400, not a silent 2024 fallback.
  it("400s when edition is omitted", async () => {
    const response = await supertest.agent(createApp()).set("Cookie", COOKIE).get("/api/reference");
    expect(response.status).toBe(400);
    expect(response.body.error).toContain("edition");
  });

  // #1325/#1348: Background.originFeatId is a raw FK baked onto the 2024 Feat
  // row at seed time (resolveOriginFeatId) — resolving it BY NAME through
  // resolveEditionCatalog instead makes this preview agree with what
  // buildOriginEntry actually grants a 2014 character. Alert is the only
  // origin feat with textually distinct 2014/2024 rows.
  it("resolves a background's origin feat for the requested edition (#1348 cross-link)", async () => {
    const app = createApp();
    const criminal2014 = await supertest.agent(app).set("Cookie", COOKIE).get("/api/reference?edition=EDITION_2014");
    const criminal2024 = await supertest.agent(app).set("Cookie", COOKIE).get("/api/reference?edition=EDITION_2024");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- response.body is untyped JSON (supertest), matching this file's existing byName helpers
    const byName = (body: any, name: string) => body.backgrounds.find((b: { name: string }) => b.name === name);

    const alert2014 = byName(criminal2014.body, "Criminal").originFeat;
    const alert2024 = byName(criminal2024.body, "Criminal").originFeat;
    expect(alert2014.name).toBe("Alert");
    expect(alert2024.name).toBe("Alert");
    expect(alert2014.description).toMatch(/\+5 bonus to initiative/);
    expect(alert2024.description).toMatch(/Proficiency Bonus/);

    // The resolved row must be projected back to OriginFeatOption's four fields:
    // `edition` is selected only to drive resolveEditionCatalog and would
    // otherwise ride along on the wire, widening the contract silently.
    expect(Object.keys(alert2014).sort()).toEqual(["category", "description", "id", "name"]);

    // Folk Hero: no origin feat in either edition (spec-less legacy row, #1130).
    expect(byName(criminal2014.body, "Folk Hero").originFeat).toBeNull();
    expect(byName(criminal2024.body, "Folk Hero").originFeat).toBeNull();

    // Soldier: Savage Attacker is edition: null (shared path) — same row both editions.
    expect(byName(criminal2014.body, "Soldier").originFeat.name).toBe("Savage Attacker");
    expect(byName(criminal2024.body, "Soldier").originFeat.name).toBe("Savage Attacker");
  });

  // #1322: the 14 conditions' resolved {key,label,description} rows, edition-
  // aware — catalog content identical for every character of an edition, so it
  // rides /reference rather than the character payload.
  it("ships conditions resolved for the requested edition (#1322)", async () => {
    const app = createApp();
    const res2014 = await supertest.agent(app).set("Cookie", COOKIE).get("/api/reference?edition=EDITION_2014");
    const res2024 = await supertest.agent(app).set("Cookie", COOKIE).get("/api/reference?edition=EDITION_2024");
    expect(res2014.status).toBe(200);
    expect(res2024.status).toBe(200);

    expect(res2014.body.conditions).toHaveLength(14);
    expect(res2024.body.conditions).toHaveLength(14);

    // rollEffects never reaches the wire — shipping the raw grants would ship the rule.
    for (const row of res2024.body.conditions) {
      expect(Object.keys(row).sort()).toEqual(["description", "key", "label"]);
    }

    // Labels alphabetical, first is Blinded.
    expect(res2024.body.conditions[0]).toMatchObject({ key: "blinded", label: "Blinded" });

    // One of #1309's nine divergent conditions, forked both ways.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- response.body is untyped JSON (supertest), matching this file's existing byName helpers
    const findCond = (body: any, key: string) => body.conditions.find((c: { key: string }) => c.key === key);
    const grappled2014 = findCond(res2014.body, "grappled");
    const grappled2024 = findCond(res2024.body, "grappled");
    expect(grappled2014.label).toBe("Grappled");
    expect(grappled2014.description).toContain("The condition ends if the grappler is incapacitated");
    expect(grappled2024.description).toContain("other than the grappler");

    // 2014's incapacitated is the short, exact PHB'14 sentence.
    expect(findCond(res2014.body, "incapacitated").description).toBe("Can't take actions or reactions.");

    // One of the five edition-invariant conditions resolves identically.
    expect(findCond(res2014.body, "poisoned").description).toBe(findCond(res2024.body, "poisoned").description);
  });

  // #1430: the universal turn actions, forked per edition — the client held this
  // copy in turnRules.ts until this slice, so these assertions are what stops it
  // regressing to one edition's text for both.
  it("ships universal actions resolved for the requested edition (#1430)", async () => {
    const app = createApp();
    const res2014 = await supertest.agent(app).set("Cookie", COOKIE).get("/api/reference?edition=EDITION_2014");
    const res2024 = await supertest.agent(app).set("Cookie", COOKIE).get("/api/reference?edition=EDITION_2024");
    expect(res2014.status).toBe(200);
    expect(res2024.status).toBe(200);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- response.body is untyped JSON (supertest), matching this file's existing byName helpers
    const byKey = (body: any, key: string) => body.universalActions.find((a: { key: string }) => a.key === key);
    const keys = (body: { universalActions: { key: string }[] }) => body.universalActions.map((a) => a.key);

    // The 2024-only pair, and its absence from 2014.
    expect(keys(res2024.body)).toContain("study");
    expect(keys(res2024.body)).toContain("influence");
    expect(keys(res2014.body)).not.toContain("study");
    expect(keys(res2014.body)).not.toContain("influence");

    // `key` is edition-stable identity; only name/description fork.
    expect(byKey(res2024.body, "useObject").name).toBe("Utilize");
    expect(byKey(res2014.body, "useObject").name).toBe("Use an Object");
    expect(byKey(res2024.body, "castSpell").name).toBe("Magic");
    expect(byKey(res2014.body, "castSpell").name).toBe("Cast a Spell");

    // `edition` must not reach the wire — same rule as originFeatByName.
    for (const row of [...res2024.body.universalActions, ...res2014.body.universalActions]) {
      expect(Object.keys(row).sort()).toEqual(["cost", "description", "key", "name"]);
    }

    // Ordered by NAME after resolution, not by the findMany — a name-ordered
    // query would leave 2024's "Magic" at "Cast a Spell"'s alphabetical slot.
    const names2024: string[] = res2024.body.universalActions.map((a: { name: string }) => a.name);
    expect(names2024).toEqual([...names2024].sort((a, b) => a.localeCompare(b)));
    expect(names2024).toContain("Magic");

    // The live rules bug this fork fixes: the client shipped SRD 5.1's contest
    // to every character, 2024 ones included.
    for (const key of ["grapple", "shove"]) {
      expect(byKey(res2014.body, key).description).toContain("Strength (Athletics) check contested by");
      expect(byKey(res2024.body, key).description).toContain(
        "Strength or Dexterity saving throw (it chooses which)",
      );
      expect(byKey(res2024.body, key).description).toContain("8 plus your Strength modifier and Proficiency Bonus");
      expect(byKey(res2024.body, key).description).not.toContain("Athletics");
    }

    // Both cost partitions are served, so ActionSlot and ReactionSlot each have rows.
    const costs = (body: { universalActions: { cost: string }[] }) =>
      [...new Set(body.universalActions.map((a) => a.cost))].sort();
    expect(costs(res2014.body)).toEqual(["action", "bonusAction", "reaction"]);
    expect(costs(res2024.body)).toEqual(["action", "bonusAction", "reaction"]);
  });

  // #1437: the six magic-item rarity tiers with their standard gp values. Unlike
  // conditions above this is edition-INVARIANT, so the last assertion is a latch:
  // it fails the day someone routes ITEM_RARITIES through resolveEditionCatalog.
  it("ships the item rarity tiers, identically for both editions (#1437)", async () => {
    const app = createApp();
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

  // #1336: the write path (character-create.ts, level-up-transaction.ts)
  // already rejects a cross-edition subclass/background id via
  // crossEditionRejection — these fixture-seeded forked rows prove the read
  // path (this endpoint) no longer offers what the write path would refuse.
  // No real forked Subclass/Background row is seeded yet (that's #1559), so
  // fixtures stand in, same discipline as catalog-edition-constraints.test.ts
  // and subclass-in-tx.integration.test.ts.
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

      // Background has no free-text field to carry a probe value, so
      // toolProficiencies (a plain string array with no seeded overlap risk)
      // stands in as the distinguishing marker between fixture rows.
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
      // Never touch the real seeded catalog — delete only the Zzz-prefixed
      // fixture rows this block created, so sibling tests in this file still
      // see the unmodified Fighter roster and background list.
      await prisma.subclass.deleteMany({ where: { name: { in: SUBCLASS_NAMES } } });
      await prisma.background.deleteMany({ where: { name: { in: BACKGROUND_NAMES } } });
    });

    async function fetchBoth() {
      const app = createApp();
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

    // withEditionOrShared's whole contract: a null-edition row is not
    // exclusive to either edition.
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

    // resolveEditionCatalog's job, distinct from the shared-row case above: an
    // exact-edition row must win over a same-name shared twin, not merely
    // coexist with it.
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

    // resolveEditionRow's documented "not in the catalog" semantics: a row
    // tagged for the other edition with no shared twin is simply absent.
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
          "toolProficiencies",
        ]);
      }
    });
  });

  // #1565/#1570: background startingEquipment resolves by (backgroundId,
  // edition) exactly like a class's — asserted against real BOOK VALUES, never
  // "differs from 2014" (which would pass on any wrong transcription just as
  // readily as a correct one). Only Folk Hero gets no package in EITHER
  // edition (PHB'24 dropped it, and it has no SRD text); 2014
  // Charlatan/Criminal/Noble/Sage/Soldier get none either (SRD 5.1 ships only
  // Acolyte) — asserting null for those pairs is the other half of the scope
  // finding.
  describe("background starting-equipment (#1565)", () => {
    it("each EDITION_2024 background carries its own option-A GP and a null package-level gold", async () => {
      const response = await supertest
        .agent(createApp())
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

      // Folk Hero is the one background with no package in either edition.
      expect(byName("Folk Hero").startingEquipment, "Folk Hero 2024").toBeNull();
    });

    it("EDITION_2014 Acolyte carries SRD 5.1's fixed one-option list with 15 GP; every other background is null", async () => {
      const response = await supertest
        .agent(createApp())
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

      for (const name of ["Charlatan", "Criminal", "Folk Hero", "Noble", "Sage", "Soldier"]) {
        expect(byName(name).startingEquipment, `${name} 2014`).toBeNull();
      }
    });

    // Mutation proof: drop the edition filter (change the query below to
    // exact-match EDITION_2014 unconditionally, mirroring what a broken
    // reference.ts would serve) and the 2024 test above goes red — its four
    // backgrounds would report null instead of their real SRD 5.2 packages.
    // Confirmed by temporarily hardcoding the `edition` variable passed to
    // the startingEquipmentPackage.findMany query to "EDITION_2014" in
    // reference.ts and re-running this file (see this PR's report for the
    // red output), then reverting.
  });

  // #1308: CharacterClass has no edition column by design — one row serves
  // both editions, and subclassGateLevel is an edition-divergent field on it.
  // `subclasses` is excluded because #1336 makes THAT field edition-filtered
  // on purpose (the describe block above); `startingEquipment` is excluded
  // because #1535 makes IT genuinely edition-divergent content too (a real
  // PHB'24 package, not the pre-#1535 2014 copy) via the same exact
  // (classId, edition) resolution as subclasses, not a fallback. This latch
  // guards every OTHER class field against a future "for symmetry" filter,
  // same shape as this file's itemRarities latch (edition-invariant, not
  // edition-resolved).
  it("classes (apart from subclassGateLevel/subclasses/startingEquipment) and races are identical between editions (#1308/#1535)", async () => {
    const app = createApp();
    const res2014 = await supertest.agent(app).set("Cookie", COOKIE).get("/api/reference?edition=EDITION_2014");
    const res2024 = await supertest.agent(app).set("Cookie", COOKIE).get("/api/reference?edition=EDITION_2024");

    const stripEditionDivergentFields = (c: Record<string, unknown>) => {
      const rest = { ...c };
      delete rest.subclassGateLevel;
      delete rest.subclasses;
      delete rest.startingEquipment;
      return rest;
    };
    expect(res2014.body.classes.map(stripEditionDivergentFields)).toEqual(
      res2024.body.classes.map(stripEditionDivergentFields),
    );
    expect(res2014.body.races).toEqual(res2024.body.races);
  });

  // #1559: proves #1336's edition-scoping and #1559's Subclass tag compose —
  // the REAL seeded Path of the Totem Warrior row (never the Zzz fixtures
  // above, which stand in for a forked row no real subclass has yet), tagged
  // EDITION_2014 because SRD 5.2 replaces it with Path of the Wild Heart
  // rather than retabbing it. A 2024 Barbarian must no longer be offered a
  // subclass with zero features in its own edition.
  it("no longer offers the real Path of the Totem Warrior to a 2024 Barbarian, but still offers it to a 2014 one (#1559)", async () => {
    const app = createApp();
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

    // Berserker is edition: null (shared) — still offered to both, so this
    // isn't "2024 Barbarian sees no subclasses", only Totem Warrior's absence.
    expect(barbarian2024.subclasses.map((s: { name: string }) => s.name)).toContain("Berserker");
  });
});
