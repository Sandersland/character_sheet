import { expect, test } from "@playwright/test";

import { login } from "./helpers/auth";
import { collectConsoleErrors } from "./helpers/console";
import { enterLiveCombat, createSessionCharacter, uniqueName } from "./helpers/api";

test("session rest button: short rest spends a hit die, long rest is available", async ({ page }) => {
  await login(page);
  const errors = collectConsoleErrors(page);

  const id = await createSessionCharacter(page.request, {
    name: uniqueName("Rest Fighter"),
    className: "Fighter",
    background: "Soldier",
  });

  await page.goto(`/characters/${id}`);
  await enterLiveCombat(page);
  await expect(page).toHaveURL(/[?&]tab=combat/);

  await expect(page.getByRole("tab", { name: /Rest/ })).toHaveCount(0);

  await page.getByRole("button", { name: "Rest", exact: true }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("heading", { name: /rest/i })).toBeVisible();

  const readout = sheet.getByText(/\d+\/\d+d\d+/);
  const before = Number((await readout.textContent())?.trim().split("/")[0]);
  expect(before).toBeGreaterThan(0);
  await sheet.getByRole("button", { name: "Rest", exact: true }).click();
  await expect
    .poll(async () => Number((await readout.textContent())?.trim().split("/")[0]))
    .toBe(before - 1);

  await expect(sheet.getByRole("button", { name: /full rest/i })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  expect(errors).toEqual([]);
});
