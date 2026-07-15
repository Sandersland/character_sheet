import { expect, test, type Page } from "@playwright/test";

import { login } from "./helpers/auth";
import { collectConsoleErrors } from "./helpers/console";

// Live HP values are read from the meter's aria-valuenow, so the flow asserts on
// its own deltas rather than any seeded starting number — the Smoke Fighter
// persona is shared and never reset between specs.
function hpMeter(page: Page) {
  return page.getByRole("meter", { name: /hit points/ });
}

async function hpNow(page: Page): Promise<number> {
  return Number(await hpMeter(page).getAttribute("aria-valuenow"));
}

async function diceAvailable(page: Page): Promise<number> {
  const text = (await page.getByText(/\d+\/\d+d\d+ available/).textContent()) ?? "";
  return Number(text.trim().split("/")[0]);
}

test("HP: damage drops, heal restores, short rest spends a hit die", async ({ page }) => {
  await login(page);
  await page.getByRole("link", { name: /Smoke Fighter/ }).click();
  // The HP tracker lives on the Combat tab of the sheet's tabbed workspace.
  await page.getByRole("tab", { name: "Combat" }).click();
  await expect(page.getByRole("heading", { name: "Hit Points" })).toBeVisible();

  const errors = collectConsoleErrors(page);

  // Long rest first for a deterministic full-HP, full-dice starting point.
  await page.getByRole("button", { name: "Full rest" }).click();
  await expect
    .poll(async () => Number(await hpMeter(page).getAttribute("aria-valuenow")))
    .toBe(Number(await hpMeter(page).getAttribute("aria-valuemax")));

  const max = Number(await hpMeter(page).getAttribute("aria-valuemax"));

  // Damage drops current HP.
  await page.getByRole("radio", { name: "Damage" }).click();
  await page.getByRole("spinbutton", { name: "Damage amount" }).fill("6");
  await page.getByRole("button", { name: /apply \d+ damage/i }).click();
  await expect.poll(() => hpNow(page)).toBe(max - 6);

  // Heal restores it.
  await page.getByRole("radio", { name: "Heal" }).click();
  await page.getByRole("spinbutton", { name: "Heal amount" }).fill("2");
  await page.getByRole("button", { name: /^heal \d+$/i }).click();
  await expect.poll(() => hpNow(page)).toBe(max - 4);

  // Short rest spends a hit die from the pool.
  const before = await diceAvailable(page);
  expect(before).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Rest", exact: true }).click();
  await expect.poll(() => diceAvailable(page)).toBe(before - 1);

  expect(errors).toEqual([]);
});
