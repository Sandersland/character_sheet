import { expect, test } from "@playwright/test";

import { login } from "./helpers/auth";
import { findCharacterByName, removeCondition } from "./helpers/api";
import { collectConsoleErrors } from "./helpers/console";

// Compact conditions strip on mobile (#769): the slim session strip opens a
// "Conditions" sheet whose add path lands on the activity log, and the applied
// chip reflects back on the strip.
test.use({ viewport: { width: 390, height: 844 } });

test("session conditions strip (mobile): tap, apply a condition, see it reflect + log", async ({ page }) => {
  await login(page);

  // Clear any leftover Poisoned on the shared persona so the apply flow is deterministic.
  const fighterId = await findCharacterByName(page.request, "Session Fighter");
  await removeCondition(page.request, fighterId, "poisoned");

  const errors = collectConsoleErrors(page);
  await page.getByRole("link", { name: /Session Fighter/ }).click();
  await page.getByRole("button", { name: /(Start|Resume|Join) session|Go to fight/i }).click();
  await expect(page).toHaveURL(/[?&]tab=combat/);

  const strip = page.getByRole("button", { name: /manage conditions/i });
  await expect(strip).toBeVisible();

  // Tap the strip → the "Conditions" sheet opens with the add controls.
  await strip.click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("heading", { name: /conditions/i })).toBeVisible();

  await sheet.getByRole("button", { name: /add condition/i }).click();
  const poisonedRow = sheet.getByRole("listitem").filter({ hasText: "Poisoned" });
  await poisonedRow.getByRole("button", { name: "Apply" }).click();

  // The strip reflects the applied chip.
  await expect(strip.getByText("Poisoned")).toBeVisible();

  // Escape closes the sheet (useDialogChrome).
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // (Session-log assertion returns with the Combat-tab Turn/Log sub-nav in #962;
  // no log tab on the Combat tab yet after the #963 doorway jump.)
  expect(errors).toEqual([]);
});
