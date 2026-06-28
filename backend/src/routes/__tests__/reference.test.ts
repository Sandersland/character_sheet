import { beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "../../app.js";
import { authCookie } from "../../test-support/auth.js";

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

    // Tool proficiency data — grouped by category, used by creation and sheet.
    expect(response.body).toHaveProperty("tools");
    expect(Array.isArray(response.body.tools.all)).toBe(true);
    expect(response.body.tools.all.length).toBeGreaterThan(0);
    expect(response.body.tools.byCategory).toMatchObject({
      artisan: expect.arrayContaining([
        expect.objectContaining({ name: "Smith's Tools", category: "artisan" }),
      ]),
      musicalInstrument: expect.arrayContaining([
        expect.objectContaining({ name: "Lute", category: "musicalInstrument" }),
      ]),
      other: expect.arrayContaining([
        expect.objectContaining({ name: "Thieves' Tools", category: "other" }),
      ]),
    });

    // Classes expose tool proficiency fields.
    const fighter = response.body.classes.find((c: { name: string }) => c.name === "Fighter");
    expect(fighter).toBeDefined();
    expect(Array.isArray(fighter.toolProficiencies)).toBe(true);
    expect(Array.isArray(fighter.toolChoices)).toBe(true);
    expect(typeof fighter.toolChoiceCount).toBe("number");

    // Backgrounds expose granted tool profs.
    const criminal = response.body.backgrounds.find((b: { name: string }) => b.name === "Criminal");
    expect(criminal).toBeDefined();
    expect(criminal.toolProficiencies).toEqual(
      expect.arrayContaining(["Thieves' Tools"])
    );
  });
});
