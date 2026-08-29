import { expect, test, type Page } from "@playwright/test";

import { login } from "./helpers/auth";
import { collectConsoleErrors } from "./helpers/console";
import { createCharacter, gotoSheet, learnSpells, uniqueName } from "./helpers/api";

const WIZARD_L5_XP = 6500;

function slotRemaining(page: Page, level: number): Promise<number> {
  return page.getByTitle(`Expend a level ${level} slot`).count();
}

async function castViaDoor(page: Page, spellName: string, slotLevel?: number): Promise<void> {
  await page.getByRole("button", { name: "Cast a spell" }).click();
  await page.getByRole("button", { name: new RegExp(`^Open ${spellName}$`) }).click();
  const dialog = page.getByRole("dialog");
  if (slotLevel) {
    await dialog.getByRole("button", { name: new RegExp(`^L${slotLevel}`) }).click();
  }
  await dialog.getByRole("button", { name: new RegExp(`^Cast ${spellName}`) }).click();
  await expect(dialog).not.toBeVisible();
}

test("spellcasting: leveled cast, upcast, and free cantrip drive the slot pips", async ({ page }) => {
  await login(page);
  const id = await createCharacter(page.request, {
    name: uniqueName("Cast Wizard"),
    className: "Wizard",
    experiencePoints: WIZARD_L5_XP,
  });
  await learnSpells(page.request, id, ["Fire Bolt", "Magic Missile"]);

  const errors = collectConsoleErrors(page);
  await gotoSheet(page, id, "magic");
  await expect(page.getByRole("heading", { name: "Spell Slots" })).toBeVisible();

  const l1Before = await slotRemaining(page, 1);
  const l2Before = await slotRemaining(page, 2);

  await castViaDoor(page, "Magic Missile", 1);
  await castViaDoor(page, "Magic Missile", 2);
  await castViaDoor(page, "Fire Bolt");

  await expect.poll(() => slotRemaining(page, 1)).toBe(l1Before - 1);
  await expect.poll(() => slotRemaining(page, 2)).toBe(l2Before - 1);

  expect(errors).toEqual([]);
});
