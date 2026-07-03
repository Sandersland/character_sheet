import { expect, test, type Locator, type Page } from "@playwright/test";

import { login } from "./helpers/auth";
import { collectConsoleErrors } from "./helpers/console";
import { createCharacter, uniqueName } from "./helpers/api";

// Unarmored Defense is derived server-side (deriveArmorClass in srd.ts): the AC
// tile shows the number, its popover discloses the labeled breakdown. Each spec
// mints its own throwaway barbarian/monk via e2e/helpers/api.ts so the shared
// globalSetup roster is never mutated.

const acTile = (page: Page) => page.getByRole("button", { name: "Armor Class breakdown" });
const breakdown = (page: Page) => page.getByRole("dialog", { name: "Armor Class breakdown" });

// Open the popover and return its dialog; auto-retries until the tile shows the
// expected AC so we never race the post-equip re-derive.
async function openBreakdown(page: Page, expectedAc: number): Promise<Locator> {
  await expect(acTile(page)).toContainText(String(expectedAc));
  await acTile(page).click();
  const dialog = breakdown(page);
  await expect(dialog).toBeVisible();
  return dialog;
}

// Every dd in the popover: the breakdown addends followed by the Total row. The
// addends must sum to the Total, which must equal the displayed AC.
async function assertRowsSumTo(dialog: Locator, expectedAc: number): Promise<void> {
  const texts = await dialog.locator("dd").allInnerTexts();
  const nums = texts.map((t) => parseInt(t.replace("+", ""), 10));
  const total = nums[nums.length - 1];
  const addends = nums.slice(0, -1);
  expect(addends.reduce((sum, n) => sum + n, 0)).toBe(total);
  expect(total).toBe(expectedAc);
}

// Acquire a catalog item unequipped (zeroing its cost so a 0-gp purse isn't
// overdrawn), then equip it from its row pill.
async function acquireAndEquip(page: Page, itemLabel: string): Promise<void> {
  await page.getByRole("button", { name: "+ Add item" }).first().click();
  // The catalog picker is the only combobox; getByLabel("Item") is ambiguous
  // once the inventory search/filter toolbar renders.
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
  // Dex 14 (+2), Con 15 (+2): 10 + 2 + 2 = 14 unarmored.
  const id = await createCharacter(page.request, {
    name: uniqueName("UD Barbarian"),
    className: "Barbarian",
    abilityScores: { dexterity: 14, constitution: 15 },
  });

  const errors = collectConsoleErrors(page);
  await page.goto(`/characters/${id}`);
  await expect(page.getByRole("heading", { name: "Inventory", exact: true })).toBeVisible();

  // ── Unarmored: 10 + Dex + Con via Unarmored Defense ─────────────────────────
  let dialog = await openBreakdown(page, 14);
  await expect(dialog.getByText("Unarmored Defense", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Dex", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Con", { exact: true })).toBeVisible();
  await assertRowsSumTo(dialog, 14);

  // Popover dismissal: Escape closes it, and so does an outside click.
  await page.keyboard.press("Escape");
  await expect(breakdown(page)).toHaveCount(0);
  await acTile(page).click();
  await expect(breakdown(page)).toBeVisible();
  await page.getByText("Speed", { exact: true }).click();
  await expect(breakdown(page)).toHaveCount(0);

  // ── Shield stacks on top of Unarmored Defense: 14 + 2 = 16 ──────────────────
  await acquireAndEquip(page, "Shield");
  dialog = await openBreakdown(page, 16);
  await expect(dialog.getByText("Unarmored Defense", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Shield", { exact: true })).toBeVisible();
  await assertRowsSumTo(dialog, 16);
  await page.keyboard.press("Escape");

  // ── Body armor wins: base row is the armor name, no Unarmored Defense row ────
  await acquireAndEquip(page, "Leather Armor");
  // Leather 11 + Dex 2 + Shield 2 = 15.
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
  // Dex 14 (+2), Wis 16 (+3): 10 + 2 + 3 = 15 unarmored.
  const id = await createCharacter(page.request, {
    name: uniqueName("UD Monk"),
    className: "Monk",
    abilityScores: { dexterity: 14, wisdom: 16 },
  });

  const errors = collectConsoleErrors(page);
  await page.goto(`/characters/${id}`);
  await expect(page.getByRole("heading", { name: "Inventory", exact: true })).toBeVisible();

  // ── Unarmored: 10 + Dex + Wis via Unarmored Defense ─────────────────────────
  let dialog = await openBreakdown(page, 15);
  await expect(dialog.getByText("Unarmored Defense", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Dex", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Wis", { exact: true })).toBeVisible();
  await assertRowsSumTo(dialog, 15);
  await page.keyboard.press("Escape");

  // ── Regression net: a shield disqualifies monk UD — Wis drops out, AC falls
  //    to plain 10 + Dex + Shield = 14. If the !hasShield guard in srd.ts is
  //    removed, monk UD would survive here (15 + 2 = 17) and this fails.
  await acquireAndEquip(page, "Shield");
  dialog = await openBreakdown(page, 14);
  await expect(dialog.getByText("Shield", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Wis", { exact: true })).toHaveCount(0);
  await expect(dialog.getByText("Unarmored Defense", { exact: true })).toHaveCount(0);
  await assertRowsSumTo(dialog, 14);

  expect(errors).toEqual([]);
});
