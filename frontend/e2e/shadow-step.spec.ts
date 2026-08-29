import { expect, test } from "@playwright/test";

import { login } from "./helpers/auth";
import { enterLiveCombat, startCombatAndTurn } from "./helpers/api";
import { collectConsoleErrors } from "./helpers/console";

test("session: a Warrior of Shadow monk uses Shadow Step as a bonus action", async ({ page }) => {
  await login(page);

  const errors = collectConsoleErrors(page);
  await page.getByRole("link", { name: /Shadow Monk/ }).click();
  await enterLiveCombat(page);
  await expect(page).toHaveURL(/[?&]tab=combat/);

  await startCombatAndTurn(page);

  await expect(page.getByRole("button", { name: "Use Bonus" })).toBeVisible();
  await page.getByRole("button", { name: "Use Bonus" }).click();
  const shadowStep = page.getByRole("button", { name: "Shadow Step" });
  await expect(shadowStep).toBeVisible();
  await expect(shadowStep.getByText(/Teleport up to 60 ft/i)).toBeVisible();

  await shadowStep.click();
  await expect(page.getByRole("button", { name: "Use Bonus" })).toHaveCount(0);
  await expect(page.getByText(/Teleport up to 60 ft/i)).toBeVisible();

  expect(errors).toEqual([]);
});
