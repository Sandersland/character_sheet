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
    const response = await supertest.agent(createApp()).set("Cookie", COOKIE).get("/api/reference");

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
});
