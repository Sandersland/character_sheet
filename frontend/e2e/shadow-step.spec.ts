import { expect, test } from "@playwright/test";

import { login } from "./helpers/auth";
import { enterLiveCombat } from "./helpers/api";
import { collectConsoleErrors } from "./helpers/console";

// The Shadow Monk persona (seeded in global-setup) is Monk L6 / Warrior of Shadow,
// so Shadow Step (L6) is a bonus-action card in the session Bonus Action sheet.
// Improved Shadow Step (L11) and Cloak of Shadows (L17, 2024 rewrite, #1246)
// are gated above any seeded persona and are covered by backend unit tests instead.
test("session: a Warrior of Shadow monk uses Shadow Step as a bonus action", async ({ page }) => {
  await login(page);

  const errors = collectConsoleErrors(page);
  await page.getByRole("link", { name: /Shadow Monk/ }).click();
  await enterLiveCombat(page);
  await expect(page).toHaveURL(/[?&]tab=combat/);

  await page.getByRole("button", { name: /Start combat/i }).click();
  await page.getByRole("button", { name: "Start my turn" }).click();

  // Open the Bonus Action sheet and confirm Shadow Step is offered with its
  // reminder rule text as the card caption (AC: appears with its reminder).
  await expect(page.getByRole("button", { name: "Use Bonus" })).toBeVisible();
  await page.getByRole("button", { name: "Use Bonus" }).click();
  const shadowStep = page.getByRole("button", { name: "Shadow Step" });
  await expect(shadowStep).toBeVisible();
  await expect(shadowStep.getByText(/Teleport up to 60 ft/i)).toBeVisible();

  // Using it consumes the bonus action AND surfaces the reminder (the deliverable).
  await shadowStep.click();
  await expect(page.getByRole("button", { name: "Use Bonus" })).toHaveCount(0);
  await expect(page.getByText(/Teleport up to 60 ft/i)).toBeVisible();

  expect(errors).toEqual([]);
});
