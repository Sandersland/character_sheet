import { expect, test, type Locator, type Page } from "@playwright/test";

import { login } from "./helpers/auth";
import { collectConsoleErrors } from "./helpers/console";
import { createCharacter, gotoSheet, uniqueName } from "./helpers/api";

const acTile = (page: Page) => page.getByRole("button", { name: "Armor Class breakdown" });
const breakdown = (page: Page) => page.getByRole("dialog", { name: "Armor Class breakdown" });

async function openBreakdown(page: Page, expectedAc: number): Promise<Locator> {
  await expect(acTile(page)).toContainText(String(expectedAc));
  await acTile(page).click();
  const dialog = breakdown(page);
  await expect(dialog).toBeVisible();
  return dialog;
}

async function assertRowsSumTo(dialog: Locator, expectedAc: number): Promise<void> {
  const texts = await dialog.locator("dd").allInnerTexts();
  const nums = texts.map((t) => parseInt(t.replace("+", ""), 10));
  const total = nums[nums.length - 1];
  const addends = nums.slice(0, -1);
  expect(addends.reduce((sum, n) => sum + n, 0)).toBe(total);
  expect(total).toBe(expectedAc);
}

async function acquireAndEquip(page: Page, itemLabel: string): Promise<void> {
  await page.getByRole("button", { name: "+ Add item" }).first().click();
  await page.getByRole("combobox", { name: "Item" }).selectOption({ label: itemLabel });
  await page.getByLabel("gp", { exact: true }).fill("0");
  await page.getByRole("button", { name: "Add", exact: true }).click();

  const row = page.getByRole("listitem").filter({ hasText: itemLabel });
  await row.getByRole("button", { name: "Equip", exact: true }).click();
  await expect(row.getByRole("button", { name: "Equipped" })).toBeVisible();
}

test("armor class: barbarian Unarmored Defense — Con stacks with a shield, body armor overrides", async ({
  page,
}) => {
  await login(page);
  const id = await createCharacter(page.request, {
    name: uniqueName("UD Barbarian"),
    className: "Barbarian",
    abilityScores: { dexterity: 14, constitution: 15 },
  });

  const errors = collectConsoleErrors(page);
  await gotoSheet(page, id, "inventory");
  await expect(page.getByRole("heading", { name: "Inventory", exact: true })).toBeVisible();

  let dialog = await openBreakdown(page, 14);
  await expect(dialog.getByText("Unarmored Defense", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Dex", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Con", { exact: true })).toBeVisible();
  await assertRowsSumTo(dialog, 14);

  await page.keyboard.press("Escape");
  await expect(breakdown(page)).toHaveCount(0);
  await acTile(page).click();
  await expect(breakdown(page)).toBeVisible();
  await page.getByText("Speed", { exact: true }).and(page.locator(":visible")).click();
  await expect(breakdown(page)).toHaveCount(0);

  await acquireAndEquip(page, "Shield");
  dialog = await openBreakdown(page, 16);
  await expect(dialog.getByText("Unarmored Defense", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Shield", { exact: true })).toBeVisible();
  await assertRowsSumTo(dialog, 16);
  await page.keyboard.press("Escape");

  await acquireAndEquip(page, "Leather Armor");
  dialog = await openBreakdown(page, 15);
  await expect(dialog.getByText("Leather Armor", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Unarmored Defense", { exact: true })).toHaveCount(0);
  await assertRowsSumTo(dialog, 15);

  expect(errors).toEqual([]);
});

test("armor class: monk Unarmored Defense adds Wis, but a shield disqualifies it", async ({
  page,
}) => {
  await login(page);
  const id = await createCharacter(page.request, {
    name: uniqueName("UD Monk"),
    className: "Monk",
    abilityScores: { dexterity: 14, wisdom: 16 },
  });

  const errors = collectConsoleErrors(page);
  await gotoSheet(page, id, "inventory");
  await expect(page.getByRole("heading", { name: "Inventory", exact: true })).toBeVisible();

  let dialog = await openBreakdown(page, 15);
  await expect(dialog.getByText("Unarmored Defense", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Dex", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Wis", { exact: true })).toBeVisible();
  await assertRowsSumTo(dialog, 15);
  await page.keyboard.press("Escape");

  // Regression net for deriveArmorClassParts's hasShield check: without it,
  // monk Unarmored Defense would survive a shield and this would see 17, not 14.
  await acquireAndEquip(page, "Shield");
  dialog = await openBreakdown(page, 14);
  await expect(dialog.getByText("Shield", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Wis", { exact: true })).toHaveCount(0);
  await expect(dialog.getByText("Unarmored Defense", { exact: true })).toHaveCount(0);
  await assertRowsSumTo(dialog, 14);

  expect(errors).toEqual([]);
});
