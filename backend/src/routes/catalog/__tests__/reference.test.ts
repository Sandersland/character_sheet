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

    expect(byName("Warlock").level1SpellPicks).toEqual({ cantrips: 2, spells: 2 });
    expect(byName("Paladin").level1SpellPicks).toEqual({ cantrips: 0, spells: 2 });
    expect(byName("Wizard").level1SpellPicks).toEqual({ cantrips: 3, spells: 4 });
    expect(byName("Fighter").level1SpellPicks).toBeNull();
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

    // Folk Hero: no origin feat in either edition (spec-less legacy row, #1130).
    expect(byName(criminal2014.body, "Folk Hero").originFeat).toBeNull();
    expect(byName(criminal2024.body, "Folk Hero").originFeat).toBeNull();

    // Soldier: Savage Attacker is edition: null (shared path) — same row both editions.
    expect(byName(criminal2014.body, "Soldier").originFeat.name).toBe("Savage Attacker");
    expect(byName(criminal2024.body, "Soldier").originFeat.name).toBe("Savage Attacker");
  });
});
