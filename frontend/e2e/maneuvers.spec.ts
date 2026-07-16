import { expect, test, type Page } from "@playwright/test";

import { login } from "./helpers/auth";
import { collectConsoleErrors } from "./helpers/console";
import { findCharacterByName, restoreResourcePool } from "./helpers/api";

// The Battle Master roster persona (seeded in global-setup) is Fighter L5 with a
// subclass + the Evasive Footwork maneuver. Superiority dice are persisted spend
// state, so the shared pool is restored to full first for a deterministic count.
async function superiorityLeft(page: Page): Promise<number> {
  const text = (await page.getByText(/\d+ left/).textContent()) ?? "";
  return Number(text.match(/(\d+) left/)?.[1]);
}

test("maneuvers: spending an effect maneuver decrements a superiority die", async ({ page }) => {
  await login(page);
  const id = await findCharacterByName(page.request, "Battle Master");
  await restoreResourcePool(page.request, id, "superiorityDice");

  const errors = collectConsoleErrors(page);
  await page.goto(`/characters/${id}`);
  await expect(page.getByRole("heading", { name: /Battle Master/, level: 1 })).toBeVisible();

  await page.getByRole("button", { name: /(Start|Resume|Join) session/i }).click();
  await expect(page).toHaveURL(/\/session$/);

  await page.getByRole("button", { name: /Start combat/i }).click();
  await page.getByRole("button", { name: "Start my turn" }).click();

  // The gold effect-maneuver strip appears once in-turn with dice remaining.
  const evasive = page.getByRole("button", { name: /Evasive Footwork/ });
  await expect(evasive).toBeVisible();
  const before = await superiorityLeft(page);
  expect(before).toBeGreaterThan(0);

  await evasive.click();
  await expect.poll(() => superiorityLeft(page)).toBe(before - 1);
  await expect(page.getByText(/Evasive Footwork —/)).toBeVisible();

  expect(errors).toEqual([]);
});
