import { expect, test } from "@playwright/test";

import { login } from "./helpers/auth";
import { enterLiveCombat } from "./helpers/api";
import { collectConsoleErrors } from "./helpers/console";

test("session HP sheet: tap the bar, apply damage, see it in the log", async ({ page }) => {
  await login(page);

  const errors = collectConsoleErrors(page);
  await page.getByRole("link", { name: /Session Fighter/ }).click();
  await enterLiveCombat(page);
  await expect(page).toHaveURL(/[?&]tab=combat/);

  const bar = page.getByRole("button", { name: /manage hit points/i });
  await expect(bar).toBeVisible();
  const before = await bar.innerText();

  await bar.click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("heading", { name: /hit points/i })).toBeVisible();

  await sheet.getByRole("button", { name: "Add 10", exact: true }).click();
  await sheet.getByRole("button", { name: "Add 5", exact: true }).click();
  await sheet.getByRole("button", { name: "Increase amount", exact: true }).click();
  await sheet.getByRole("button", { name: "Increase amount", exact: true }).click();
  await sheet.getByRole("button", { name: /apply 17 damage/i }).click();

  await expect(bar).not.toHaveText(before);
  await expect(sheet.getByRole("radio", { name: /damage/i })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.getByRole("button", { name: /open session log/i }).click();
  await expect(
    page.getByRole("dialog", { name: "Session Log" }).getByText(/Took \d+.*damage/).first(),
  ).toBeVisible();

  expect(errors).toEqual([]);
});
