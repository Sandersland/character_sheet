import { expect, test, type Page } from "@playwright/test";

import { login } from "./helpers/auth";
import { createCharacter, uniqueName } from "./helpers/api";
import { collectConsoleErrors } from "./helpers/console";

// Resistance auto-halve on the damage-taken flow (#456). A raging Barbarian
// resists bludgeoning/piercing/slashing — matching damage is halved, other types
// are unaffected, and the type picker keeps typeless entry working.
function hpMeter(page: Page) {
  return page.getByRole("meter", { name: /hit points/ });
}

async function hpNow(page: Page): Promise<number> {
  return Number(await hpMeter(page).getAttribute("aria-valuenow"));
}

test("resistance: raging Barbarian halves matching damage, full for others", async ({ page }) => {
  await login(page);

  const id = await createCharacter(page.request, {
    name: uniqueName("Rage Bear"),
    className: "Barbarian",
    race: "Half-Orc",
    background: "Soldier",
  });

  // Enter rage via the actions endpoint — applies the while-active b/p/s buff.
  const rage = await page.request.post(`/api/characters/${id}/actions`, {
    data: { operations: [{ actionKey: "rage" }] },
  });
  expect(rage.ok(), `rage: ${rage.status()}`).toBeTruthy();

  await page.goto(`/characters/${id}`);
  await expect(page.getByRole("heading", { name: "Hit Points" })).toBeVisible();

  const errors = collectConsoleErrors(page);
  const start = await hpNow(page);

  // 12 slashing is resisted → preview shows the halve, HP drops by 6.
  await page.getByRole("radio", { name: "Damage" }).click();
  await page.getByRole("spinbutton", { name: "Damage amount" }).fill("12");
  await page.getByRole("combobox", { name: "Damage type" }).selectOption("slashing");
  await expect(page.getByRole("status")).toHaveText(/halves to 6/i);
  await page.getByRole("button", { name: "Apply damage" }).click();
  await expect.poll(() => hpNow(page)).toBe(start - 6);

  // 8 fire is not resisted (no preview) → HP drops by the full 8.
  const afterSlash = await hpNow(page);
  await page.getByRole("spinbutton", { name: "Damage amount" }).fill("8");
  await page.getByRole("combobox", { name: "Damage type" }).selectOption("fire");
  await expect(page.getByRole("status")).toHaveCount(0);
  await page.getByRole("button", { name: "Apply damage" }).click();
  await expect.poll(() => hpNow(page)).toBe(afterSlash - 8);

  expect(errors).toEqual([]);
});
