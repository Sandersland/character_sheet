import { expect, test } from "@playwright/test";

import { login } from "./helpers/auth";
import { enterLiveCombat, findCharacterByName, removeCondition } from "./helpers/api";
import { collectConsoleErrors } from "./helpers/console";

test.use({ viewport: { width: 390, height: 844 } });

test("session conditions strip (mobile): tap, apply a condition, see it reflect + log", async ({ page }) => {
  await login(page);

  const fighterId = await findCharacterByName(page.request, "Session Fighter");
  await removeCondition(page.request, fighterId, "poisoned");

  const errors = collectConsoleErrors(page);
  await page.getByRole("link", { name: /Session Fighter/ }).click();
  await enterLiveCombat(page);
  await expect(page).toHaveURL(/[?&]tab=combat/);

  const strip = page.getByRole("button", { name: /manage conditions/i });
  await expect(strip).toBeVisible();

  await strip.click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("heading", { name: /conditions/i })).toBeVisible();

  await sheet.getByRole("button", { name: /add condition/i }).click();
  await sheet.locator('button[title="Apply Poisoned"]').click();

  await expect(strip.getByText("Poisoned")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.getByRole("button", { name: /open session log/i }).click();
  const logSheet = page.getByRole("dialog");
  await expect(logSheet.getByText(/Applied condition: Poisoned/i).first()).toBeVisible();

  expect(errors).toEqual([]);
});
