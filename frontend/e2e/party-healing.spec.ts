import { expect, test } from "@playwright/test";

import { login } from "./helpers/auth";
import { collectConsoleErrors } from "./helpers/console";

test("campaign prefs: opt in and out of party-target healing", async ({ page }) => {
  await login(page);

  const errors = collectConsoleErrors(page);
  await page.getByRole("link", { name: /Session Fighter/ }).click();
  await expect(page.getByRole("heading", { name: /Session Fighter/, level: 1 })).toBeVisible();

  await page.getByRole("button", { name: /sheet actions/i }).click();
  await page.getByRole("menuitem", { name: /campaign settings/i }).click();

  const dialog = page.getByRole("dialog", { name: /campaign settings/i });
  await expect(dialog).toBeVisible();

  const toggle = dialog.getByRole("checkbox", { name: /allow party members to heal my sheet/i });
  await expect(toggle).toBeVisible();

  const before = await toggle.isChecked();
  await toggle.click();
  await expect(toggle).toBeChecked({ checked: !before });

  await toggle.click();
  await expect(toggle).toBeChecked({ checked: before });

  expect(errors).toEqual([]);
});
