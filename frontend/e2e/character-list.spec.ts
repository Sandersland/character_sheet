import { expect, test } from "@playwright/test";

import { login } from "./helpers/auth";
import { collectConsoleErrors } from "./helpers/console";

test("character list renders both seeded personas", async ({ page }) => {
  await login(page);

  // Observe the authed render only — the pre-auth bootstrap 401s during login
  // aren't what this smoke test is guarding.
  const errors = collectConsoleErrors(page);
  await page.reload();

  await expect(page.getByRole("link", { name: /Smoke Fighter/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Wizard L5/ })).toBeVisible();

  expect(errors).toEqual([]);
});
