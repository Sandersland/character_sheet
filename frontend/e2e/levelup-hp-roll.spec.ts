import { expect, test } from "@playwright/test";

import { login } from "./helpers/auth";
import { collectConsoleErrors } from "./helpers/console";
import { createCharacter, uniqueName } from "./helpers/api";

const XP_TO_L2 = 300;

test("levelup: the HP die lingers on its settled face alongside the result", async ({ page }) => {
  await login(page);
  const id = await createCharacter(page.request, {
    name: uniqueName("Rolling Fighter"),
    className: "Fighter",
    abilityScores: { strength: 10, dexterity: 10, constitution: 14, intelligence: 10, wisdom: 10, charisma: 10 },
  });
  await page.request.post(`/api/characters/${id}/experience`, {
    data: { operations: [{ type: "set", value: XP_TO_L2 }] },
  });

  const errors = collectConsoleErrors(page);
  await page.goto(`/characters/${id}/level-up`);

  await expect(page.getByRole("heading", { name: /roll for hit points/i })).toBeVisible();
  await page.getByRole("button", { name: /^roll 1d/i }).click();

  await expect(page.getByRole("status")).toBeVisible({ timeout: 5000 });
  await expect(page.getByText(/new maximum hp/i)).toBeVisible();
  await expect(page.getByRole("status")).toBeVisible();

  expect(errors).toEqual([]);
});
