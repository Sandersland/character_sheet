import { expect, test } from "@playwright/test";

import { login } from "./helpers/auth";
import { collectConsoleErrors } from "./helpers/console";

test("wizard sheet shows core vitals and derived spell slots", async ({ page }) => {
  await login(page);

  // Attach after login so only the authed navigation + sheet render are graded.
  const errors = collectConsoleErrors(page);
  await page.getByRole("link", { name: /Wizard L5/ }).click();

  await expect(page.getByRole("heading", { name: "Wizard L5", level: 1 })).toBeVisible();
  await expect(page.getByText("Armor Class")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Hit Points" })).toBeVisible();

  // Slots are derived from class+level+ability scores, so a L5 wizard must show
  // the Spell Slots panel with its level-1 slot meter.
  await expect(page.getByRole("heading", { name: "Spell Slots" })).toBeVisible();
  await expect(page.getByText("Level 1", { exact: true })).toBeVisible();

  expect(errors).toEqual([]);
});
