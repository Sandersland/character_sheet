import { expect, test } from "@playwright/test";

import { login } from "./helpers/auth";
import { collectConsoleErrors } from "./helpers/console";
import { createCharacter, uniqueName } from "./helpers/api";

const XP_TO_L3 = 900; // SRD 5.2 XP table (levelForExperience)

test("levelup: a Hunter Ranger can complete the Hunter's Prey subclassChoice step", async ({ page }) => {
  await login(page);
  const id = await createCharacter(page.request, {
    name: uniqueName("Hunter Ranger"),
    className: "Ranger",
    abilityScores: { strength: 10, dexterity: 10, constitution: 14, intelligence: 10, wisdom: 10, charisma: 10 },
    experiencePoints: XP_TO_L3,
  });

  await page.request.post(`/api/characters/${id}/hp`, {
    data: { operations: [{ type: "levelUp", method: "average" }] },
  });

  const errors = collectConsoleErrors(page);
  await page.goto(`/characters/${id}/level-up`);

  await expect(page.getByText("Step 1 of 3")).toBeVisible();
  await page.getByRole("button", { name: /take average/i }).click();
  await page.getByRole("button", { name: /continue/i }).click();

  await page.getByRole("radio", { name: "Hunter" }).click();
  await expect(page.getByText("Step 2 of 4")).toBeVisible();
  await page.getByRole("button", { name: /continue/i }).click();

  // Regression net: this option used to never render, showing "arrives in a
  // later update" instead with Continue stuck disabled.
  await page.getByRole("button", { name: /Colossus Slayer/ }).click();
  await expect(page.getByRole("button", { name: /continue/i })).toBeEnabled();
  await page.getByRole("button", { name: /continue/i }).click();

  await expect(page.getByText("Subclass Features")).toBeVisible();
  await expect(page.getByRole("listitem", { name: "Hunter's Prey" })).toBeVisible();

  await page.getByRole("button", { name: /confirm level up/i }).click();
  await expect(page).toHaveURL(new RegExp(`/characters/${id}$`));

  const res = await page.request.get(`/api/characters/${id}`);
  const c = (await res.json()) as {
    resources: { choicesKnown: Record<string, { name: string }[]> };
    classes: { subclass?: string }[];
  };
  expect(c.resources.choicesKnown.huntersPrey.map((e) => e.name)).toEqual(["Colossus Slayer"]);
  expect(c.classes[0].subclass).toBe("Hunter");

  expect(errors).toEqual([]);
});
