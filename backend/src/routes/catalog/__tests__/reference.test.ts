import { beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "@/app.js";
import { authCookie } from "@/test-support/auth.js";

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
});
