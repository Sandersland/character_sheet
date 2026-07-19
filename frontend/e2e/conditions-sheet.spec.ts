import { expect, test } from "@playwright/test";

import { login } from "./helpers/auth";
import { enterLiveCombat, findCharacterByName, removeCondition } from "./helpers/api";
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
  await enterLiveCombat(page);
  await expect(page).toHaveURL(/[?&]tab=combat/);

  const strip = page.getByRole("button", { name: /manage conditions/i });
  await expect(strip).toBeVisible();

  // Tap the strip → the "Conditions" sheet opens with the add controls.
  await strip.click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("heading", { name: /conditions/i })).toBeVisible();

  await sheet.getByRole("button", { name: /add condition/i }).click();
  // Exact-text match on the row label — Petrified's 2024 blurb also contains
  // "Poisoned" ("immunity to the Poisoned condition"), so a loose hasText matches two rows.
  const poisonedRow = sheet
    .getByRole("listitem")
    .filter({ has: sheet.getByText("Poisoned", { exact: true }) });
  await poisonedRow.getByRole("button", { name: "Apply" }).click();

  // The strip reflects the applied chip.
  await expect(strip.getByText("Poisoned")).toBeVisible();

  // Escape closes the sheet (useDialogChrome).
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // The apply lands on the session log — opened on demand from the one-line log
  // row, which is a bottom sheet on mobile (#1086; the pinned peek strip is gone).
  await page.getByRole("button", { name: /open session log/i }).click();
  const logSheet = page.getByRole("dialog");
  await expect(logSheet.getByText(/Applied condition: Poisoned/i).first()).toBeVisible();

  expect(errors).toEqual([]);
});
