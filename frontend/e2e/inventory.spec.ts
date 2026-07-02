import { expect, test } from "@playwright/test";

import { login } from "./helpers/auth";
import { collectConsoleErrors } from "./helpers/console";
import { createSessionCharacter, uniqueName } from "./helpers/api";

// A fresh, session-ready character keeps the inventory (and thus the in-session
// attack row) unambiguous: exactly one weapon exists, so its equipped state maps
// cleanly onto the attack row.
test("inventory: add catalog item shows weight/qty; equip/unequip drives the attack row", async ({
  page,
}) => {
  await login(page);
  // Name avoids the word "Inventory" so it can't collide with the section heading/tab.
  const id = await createSessionCharacter(page.request, {
    name: uniqueName("Pack Fighter"),
    className: "Fighter",
  });

  const errors = collectConsoleErrors(page);
  await page.goto(`/characters/${id}`);
  await expect(page.getByRole("heading", { name: "Inventory", exact: true })).toBeVisible();

  // ── Add a catalog Dagger (weight 1 lb) with quantity 2 ──────────────────────
  await page.getByRole("button", { name: "+ Add item" }).first().click();
  await page.getByLabel("Item").selectOption({ label: "Dagger" });
  await page.getByLabel("Quantity").fill("2");
  // Zero the prefilled catalog cost so the acquire doesn't overdraw a 0-gp purse.
  await page.getByLabel("gp", { exact: true }).fill("0");
  await page.getByRole("button", { name: "Add", exact: true }).click();

  // The row's dotted detail line carries both quantity and computed weight.
  await expect(page.getByText("Dagger")).toBeVisible();
  await expect(page.getByText(/2x · 2 lb/)).toBeVisible();

  // Equip it from the sheet (the only Equip control here is this row's pill).
  await page.getByRole("button", { name: "Equip", exact: true }).click();
  await expect(page.getByRole("button", { name: "Equipped" })).toBeVisible();

  // ── Into the live session, where the attack row reflects equipped weapons ────
  await page.getByRole("button", { name: /(Start|Resume|Join) Session/ }).click();
  await expect(page).toHaveURL(/\/session$/);

  await page.getByRole("button", { name: "Start Combat" }).click();
  await page.getByRole("button", { name: "Start Turn" }).click();
  await page.getByRole("button", { name: /Use Action/ }).click();
  await page.getByRole("button", { name: "Attack", exact: true }).click();

  // Equipped → the Dagger is an attack row, not in the inline "Equip a weapon"
  // list (no unequipped weapons remain, so that panel is absent).
  await expect(page.getByText("Select Attack")).toBeVisible();
  await expect(page.getByText("Dagger").first()).toBeVisible();
  await expect(page.getByText("Equip a weapon")).toHaveCount(0);

  // Unequip from the Inventory tab (still the active tab) — the open attack
  // picker re-renders live, dropping the Dagger into the equip list.
  await page.getByRole("button", { name: "Equipped", pressed: true }).click();
  await expect(page.getByText("Equip a weapon")).toBeVisible();

  expect(errors).toEqual([]);
});
