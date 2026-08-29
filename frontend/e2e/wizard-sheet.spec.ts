import { expect, test } from "@playwright/test";

import { login } from "./helpers/auth";
import { collectConsoleErrors } from "./helpers/console";

test("wizard sheet shows core vitals and derived spell slots", async ({ page }) => {
  await login(page);

  const errors = collectConsoleErrors(page);
  await page.getByRole("link", { name: /Wizard L5/ }).click();

  await expect(page.getByRole("heading", { name: "Wizard L5", level: 1 })).toBeVisible();
  await expect(page.getByText("Armor Class")).toBeVisible();

  await page.getByRole("tab", { name: "Combat" }).click();
  await expect(page.getByText("Hit Points")).toBeVisible();

  await page.getByRole("tab", { name: "Magic" }).click();
  await expect(page.getByRole("heading", { name: "Spell Slots" })).toBeVisible();
  await expect(page.getByText("1st", { exact: true }).first()).toBeVisible();

  expect(errors).toEqual([]);
});
