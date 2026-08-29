import { expect, test, type Page } from "@playwright/test";

import { login } from "./helpers/auth";
import { createCharacter, gotoSheet, uniqueName } from "./helpers/api";
import { collectConsoleErrors } from "./helpers/console";

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
    background: "Soldier",
  });

  const rage = await page.request.post(`/api/characters/${id}/actions/transactions`, {
    data: { operations: [{ type: "executeAction", actionKey: "rage" }] },
  });
  expect(rage.ok(), `rage: ${rage.status()}`).toBeTruthy();

  await gotoSheet(page, id, "combat");
  await expect(page.getByRole("heading", { name: "Hit Points" })).toBeVisible();

  const errors = collectConsoleErrors(page);
  const start = await hpNow(page);

  await page.getByRole("radio", { name: "Damage" }).click();
  await page.getByRole("spinbutton", { name: "Damage amount" }).fill("12");
  await page.getByRole("combobox", { name: "Damage type" }).selectOption("slashing");
  await expect(page.getByRole("status")).toHaveText(/halves to 6/i);
  await page.getByRole("button", { name: /apply \d+ damage/i }).click();
  await expect.poll(() => hpNow(page)).toBe(start - 6);

  const afterSlash = await hpNow(page);
  await page.getByRole("spinbutton", { name: "Damage amount" }).fill("8");
  await page.getByRole("combobox", { name: "Damage type" }).selectOption("fire");
  await expect(page.getByRole("status")).toHaveCount(0);
  await page.getByRole("button", { name: /apply \d+ damage/i }).click();
  await expect.poll(() => hpNow(page)).toBe(afterSlash - 8);

  expect(errors).toEqual([]);
});
