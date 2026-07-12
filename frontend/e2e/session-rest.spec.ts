import { expect, test } from "@playwright/test";

import { login } from "./helpers/auth";
import { collectConsoleErrors } from "./helpers/console";

// Session rest button (#814): the Rest & HP tab is gone; rests now live behind an
// always-visible campfire button beside the HP strip.
test("session rest button: short rest spends a hit die, long rest is available", async ({ page }) => {
  await login(page);

  const errors = collectConsoleErrors(page);
  await page.getByRole("link", { name: /Session Fighter/ }).click();
  await page.getByRole("button", { name: /(Start|Resume|Join) Session/ }).click();
  await expect(page).toHaveURL(/\/session$/);

  // No Rest & HP tab in the reference strip anymore.
  await expect(page.getByRole("tab", { name: /Rest/ })).toHaveCount(0);

  // Open the rest sheet from the always-visible button.
  await page.getByRole("button", { name: "Rest", exact: true }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("heading", { name: /rest/i })).toBeVisible();

  // Read the hit-dice count, spend one on a short rest, and see it decrement.
  const readout = sheet.getByText(/\d+\/\d+d\d+/);
  const before = Number((await readout.textContent())?.trim().split("/")[0]);
  expect(before).toBeGreaterThan(0);
  await sheet.getByRole("button", { name: "Rest", exact: true }).click();
  await expect
    .poll(async () => Number((await readout.textContent())?.trim().split("/")[0]))
    .toBe(before - 1);

  // Long rest is available and closes cleanly.
  await expect(sheet.getByRole("button", { name: /full rest/i })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  expect(errors).toEqual([]);
});
