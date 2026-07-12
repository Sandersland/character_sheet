import { expect, test } from "@playwright/test";

import { login } from "./helpers/auth";
import { collectConsoleErrors } from "./helpers/console";

// Tap-to-manage HP sheet (#768): the always-visible session HP strip opens a
// "Hit Points" sheet whose damage path mirrors the Rest tab.
test("session HP sheet: tap the bar, apply damage, see it in the log", async ({ page }) => {
  await login(page);

  const errors = collectConsoleErrors(page);
  await page.getByRole("link", { name: /Session Fighter/ }).click();
  await page.getByRole("button", { name: /(Start|Resume|Join) Session/ }).click();
  await expect(page).toHaveURL(/\/session$/);

  const bar = page.getByRole("button", { name: /manage hit points/i });
  await expect(bar).toBeVisible();
  const before = await bar.innerText();

  // Tap the bar → the "Hit Points" sheet opens with the damage controls.
  await bar.click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("heading", { name: /hit points/i })).toBeVisible();

  await sheet.getByRole("spinbutton", { name: /damage amount/i }).fill("7");
  await sheet.getByRole("button", { name: /apply damage/i }).click();

  // The bar reflects the new HP total; the sheet stays open/responsive.
  await expect(bar).not.toHaveText(before);
  await expect(sheet.getByRole("radio", { name: /damage/i })).toBeVisible();

  // Escape closes the sheet (useDialogChrome).
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // The damage event lands on the activity log like Rest-tab damage.
  await page.getByRole("tab", { name: /Log/ }).click();
  await expect(page.getByText("damage", { exact: true }).first()).toBeVisible();

  expect(errors).toEqual([]);
});
