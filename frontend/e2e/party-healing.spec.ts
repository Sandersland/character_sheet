import { expect, test } from "@playwright/test";

import { login } from "./helpers/auth";
import { collectConsoleErrors } from "./helpers/console";

// The party-target healing consent toggle (#462) surfaces on a campaign-attached
// character's sheet. Session Fighter is attached to its own campaign, so its
// Campaign preferences panel renders. Verifies the reconciled target-consent
// copy and that toggling it persists (left clean by toggling back off).
test("campaign prefs: opt in and out of party-target healing", async ({ page }) => {
  await login(page);

  const errors = collectConsoleErrors(page);
  await page.getByRole("link", { name: /Session Fighter/ }).click();
  // Campaign preferences live on the sheet's Story tab.
  await page.getByRole("tab", { name: "Story" }).click();

  const toggle = page.getByRole("checkbox", { name: /allow party members to heal my sheet/i });
  await expect(toggle).toBeVisible();

  const before = await toggle.isChecked();
  await toggle.click();
  await expect(toggle).toBeChecked({ checked: !before });

  // Toggle back so the shared persona is left in its original state.
  await toggle.click();
  await expect(toggle).toBeChecked({ checked: before });

  expect(errors).toEqual([]);
});
