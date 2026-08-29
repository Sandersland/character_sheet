import { expect, test } from "@playwright/test";

import { login } from "./helpers/auth";
import { enterLiveCombat, startCombatAndTurn } from "./helpers/api";
import { collectConsoleErrors } from "./helpers/console";

test("unarmed: Monk L6 shows the Empowered Strikes magical badge", async ({ page }) => {
  await login(page);

  const errors = collectConsoleErrors(page);
  await page.getByRole("link", { name: /Monk L6/ }).click();
  await enterLiveCombat(page);
  await expect(page).toHaveURL(/[?&]tab=combat/);

  await startCombatAndTurn(page);

  await page.getByRole("button", { name: /Use Action/ }).click();
  await page.getByRole("button", { name: "Attack", exact: true }).click();

  await page.getByRole("radio", { name: "Unarmed Strike" }).click();
  await expect(page.getByText("Magical")).toBeVisible();

  expect(errors).toEqual([]);
});
