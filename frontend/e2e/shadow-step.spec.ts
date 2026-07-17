import { expect, test } from "@playwright/test";

import { login } from "./helpers/auth";
import { collectConsoleErrors } from "./helpers/console";

// The Shadow Monk persona (seeded in global-setup) is Monk L6 / Way of Shadow,
// so Shadow Step (L6) is a bonus-action card in the session Bonus Action sheet.
// Opportunist (L17) is gated above any seeded persona and is covered by the
// backend deriveActions unit tests instead.
test("session: a Way of Shadow monk uses Shadow Step as a bonus action", async ({ page }) => {
  await login(page);

  const errors = collectConsoleErrors(page);
  await page.getByRole("link", { name: /Shadow Monk/ }).click();
  await page.getByRole("button", { name: /(Start|Resume|Join) session|Go to fight/i }).click();
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
