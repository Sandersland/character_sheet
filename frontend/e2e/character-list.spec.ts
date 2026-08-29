import { expect, test } from "@playwright/test";

import { login } from "./helpers/auth";
import { collectConsoleErrors } from "./helpers/console";

test("character list renders both seeded personas", async ({ page }) => {
  await login(page);

  const errors = collectConsoleErrors(page);
  await page.reload();

  await expect(page.getByRole("link", { name: /Smoke Fighter/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Wizard L5/ })).toBeVisible();

  expect(errors).toEqual([]);
});
