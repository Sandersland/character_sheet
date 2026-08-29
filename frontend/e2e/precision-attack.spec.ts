import { expect, test } from "@playwright/test";

import { login } from "./helpers/auth";
import { collectConsoleErrors } from "./helpers/console";
import { enterLiveCombat, findCharacterByName, learnManeuver, restoreResourcePool, startCombatAndTurn } from "./helpers/api";

test("precision attack: the affordance is under the resolution rail", async ({ page }) => {
  await login(page);
  const id = await findCharacterByName(page.request, "Battle Master");
  await learnManeuver(page.request, id, "Precision Attack");
  await restoreResourcePool(page.request, id, "superiorityDice");

  const errors = collectConsoleErrors(page);
  await page.goto(`/characters/${id}`);
  await expect(page.getByRole("heading", { name: /Battle Master/, level: 1 })).toBeVisible();

  await enterLiveCombat(page);
  await expect(page).toHaveURL(/[?&]tab=combat/);

  await startCombatAndTurn(page);

  await page.getByRole("button", { name: /Use Action/ }).click();
  await page.getByRole("button", { name: "Attack", exact: true }).click();
  const sheet = page.getByRole("dialog");

  await sheet.getByRole("button", { name: /Battle Master maneuvers/ }).click();
  await expect(sheet.getByText("Add to Attack:")).toHaveCount(0);

  await sheet.getByRole("button", { name: "Roll to hit" }).click();
  await expect(sheet.getByText("Add to Attack:")).toBeVisible();
  await expect(sheet.getByText("Add to Damage:")).toHaveCount(0);

  const precisionButton = sheet.getByRole("button", { name: /Precision Attack/ });
  await precisionButton.click();
  await expect(precisionButton).toBeDisabled();

  expect(errors).toEqual([]);
});

// #1844: this test stays skipped until AttackResultLine takes an overrideTotal — useResolution has no override seam yet.
test.fixme(
  "precision attack: spending boosts the to-hit total shown on the rail and reaches the committed event (#1844)",
  async () => {},
);
