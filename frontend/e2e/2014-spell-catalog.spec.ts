import { expect, test, type Page } from "@playwright/test";

import { login } from "./helpers/auth";
import { collectConsoleErrors } from "./helpers/console";
import { passEntryGate } from "./helpers/creation";
import { createCharacter, gotoSheet, openSpellbook, uniqueName } from "./helpers/api";

function continueStep(page: Page) {
  return page.getByRole("button", { name: /Continue/ }).click();
}

// PHB'14 p.220 wording — "thumbs touching" does not appear in SRD 5.2, so the match proves the edition.
const BURNING_HANDS_2014_PHRASE = /thumbs touching/;

test("creation: a 2014 Wizard's spell picker offers the 2014 catalog, with PHB'14 text", async ({ page }) => {
  const name = uniqueName("Old Ways Scholar");

  await login(page);
  const errors = collectConsoleErrors(page);
  await page.getByRole("link", { name: "New Character" }).first().click();
  await expect(page).toHaveURL(/\/characters\/new$/);
  await passEntryGate(page, { edition: "2014" });

  await page.getByLabel(/^Name/).fill(name);
  await page.getByLabel(/^Alignment/).selectOption({ label: "True Neutral" });
  await page.getByLabel(/^Species/).selectOption({ label: "Human" });
  await page.getByLabel(/^Class/).selectOption({ label: "Wizard" });
  await page.getByLabel("Background").selectOption({ label: "Sage" });
  await continueStep(page);

  await expect(page.getByRole("radio", { name: /^\+[12] to / })).toHaveCount(0);
  await continueStep(page);

  await continueStep(page);

  await expect(page.getByRole("heading", { name: "Learn your magic" })).toBeVisible();
  await page.getByRole("radio", { name: /Spellbook/ }).click();

  await page.getByRole("button", { name: "Open Burning Hands" }).click();
  await expect(page.getByText(BURNING_HANDS_2014_PHRASE)).toBeVisible();
  await page.getByRole("button", { name: /Learn Burning Hands/ }).click();

  await page.getByRole("button", { name: "Add Find Familiar" }).click();
  await page.getByRole("button", { name: "Add Magic Missile" }).click();
  await page.getByRole("button", { name: "Add Shield" }).click();
  await page.getByRole("button", { name: "Add Mage Armor" }).click();
  await page.getByRole("button", { name: "Add Thunderwave" }).click();

  await page.getByRole("radio", { name: /Cantrips/ }).click();
  await page.getByRole("button", { name: "Add Fire Bolt" }).click();
  await page.getByRole("button", { name: "Add Mage Hand" }).click();
  await page.getByRole("button", { name: "Add Prestidigitation" }).click();
  await continueStep(page);

  await page.getByRole("button", { name: /Starting gold/ }).click();
  await page.getByRole("button", { name: /^Roll.*×/ }).click();
  await continueStep(page);

  await page.getByRole("button", { name: /Create Character/ }).click();
  await expect(page).toHaveURL(/\/characters\/[0-9a-f-]+$/);

  await page.getByRole("tab", { name: "Magic" }).click();
  await openSpellbook(page);
  await expect(page.getByText("Burning Hands").first()).toBeVisible();
  await expect(page.getByText("Find Familiar").first()).toBeVisible();

  expect(errors).toEqual([]);
});

test("sheet: a 2014 Cleric's 'Learn a spell' panel, reached after leveling up, offers only the 2014 catalog", async ({
  page,
}) => {
  await login(page);
  const id = await createCharacter(page.request, {
    name: uniqueName("Old Ways Cleric"),
    className: "Cleric",
    speciesName: "Human",
    background: "Sage",
    rulesEdition: "EDITION_2014",
  });

  const errors = collectConsoleErrors(page);
  await gotoSheet(page, id, "overview");
  await expect(page.getByText("Level 1").first()).toBeVisible();

  await page.getByLabel("XP to award").fill("300");
  await page.getByRole("button", { name: "Award XP" }).click();
  await expect(page.getByText("Level 2").first()).toBeVisible();

  await page.getByRole("tab", { name: "Magic" }).click();
  await openSpellbook(page);
  await page.getByRole("button", { name: "+ Learn a spell" }).click();

  const search = page.getByRole("searchbox", { name: "Search spells" });
  await search.fill("Guiding Bolt");
  await expect(page.getByText("Guiding Bolt")).toBeVisible();
  await page.getByRole("button", { name: "Learn", exact: true }).click();

  await search.fill("Dissonant Whispers");
  await expect(page.getByText("No spells match your filter.")).toBeVisible();

  expect(errors).toEqual([]);
});

test("GET /api/spells is edition-scoped: 2014 is the full PHB'14 breadth, 2024 stays curated", async ({ page }) => {
  await login(page);

  const res2014 = await page.request.get("/api/spells?edition=EDITION_2014");
  const res2024 = await page.request.get("/api/spells?edition=EDITION_2024");
  expect(res2014.ok(), `2014 spells: ${res2014.status()}`).toBeTruthy();
  expect(res2024.ok(), `2024 spells: ${res2024.status()}`).toBeTruthy();

  const spells2014 = (await res2014.json()) as { name: string; description: string }[];
  const spells2024 = (await res2024.json()) as { name: string; description: string }[];
  const names2014 = new Set(spells2014.map((s) => s.name));
  const names2024 = new Set(spells2024.map((s) => s.name));

  expect(names2014.size).toBeGreaterThan(names2024.size * 2);

  expect(names2014.has("Find Familiar")).toBe(true);
  expect(names2024.has("Find Familiar")).toBe(false);

  expect(names2024.has("Dissonant Whispers")).toBe(true);
  expect(names2014.has("Dissonant Whispers")).toBe(false);

  const burningHands2014 = spells2014.find((s) => s.name === "Burning Hands");
  const burningHands2024 = spells2024.find((s) => s.name === "Burning Hands");
  expect(burningHands2014, "Burning Hands served under EDITION_2014").toBeTruthy();
  expect(burningHands2024, "Burning Hands served under EDITION_2024").toBeTruthy();
  expect(burningHands2014!.description).toMatch(/thumbs touching/);
  expect(burningHands2024!.description).not.toMatch(/thumbs touching/);
  expect(burningHands2014!.description).not.toBe(burningHands2024!.description);
});
