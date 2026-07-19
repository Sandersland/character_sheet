import { expect, test } from "@playwright/test";

import { login } from "./helpers/auth";
import { collectConsoleErrors } from "./helpers/console";

// The party-target healing consent toggle (#462) lives in the header ⋮ → "Campaign
// settings" sheet (#1087; it used to sit on the Story tab). Session Fighter is
// attached to its own campaign, so the ⋮ item shows. Verifies the reconciled
// target-consent copy and that toggling it persists (left clean by toggling back).
test("campaign prefs: opt in and out of party-target healing", async ({ page }) => {
  await login(page);

  const errors = collectConsoleErrors(page);
  await page.getByRole("link", { name: /Session Fighter/ }).click();
  await expect(page.getByRole("heading", { name: /Session Fighter/, level: 1 })).toBeVisible();

  // Open the header overflow menu → Campaign settings. At the 1280-wide e2e
  // viewport only the desktop banner's ⋮ is in the a11y tree (mobile is
  // display:none), so "Sheet actions" is unambiguous.
  await page.getByRole("button", { name: /sheet actions/i }).click();
  await page.getByRole("menuitem", { name: /campaign settings/i }).click();

  const dialog = page.getByRole("dialog", { name: /campaign settings/i });
  await expect(dialog).toBeVisible();

  const toggle = dialog.getByRole("checkbox", { name: /allow party members to heal my sheet/i });
  await expect(toggle).toBeVisible();

  const before = await toggle.isChecked();
  await toggle.click();
  await expect(toggle).toBeChecked({ checked: !before });

  // Toggle back so the shared persona is left in its original state.
  await toggle.click();
  await expect(toggle).toBeChecked({ checked: before });

  expect(errors).toEqual([]);
});
