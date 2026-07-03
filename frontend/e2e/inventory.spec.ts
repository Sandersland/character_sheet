import { expect, test } from "@playwright/test";

import { login } from "./helpers/auth";
import { collectConsoleErrors } from "./helpers/console";
import { createCharacter, createSessionCharacter, uniqueName } from "./helpers/api";

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

// Partial sell: a stack of 3 gems (10 gp each) — the player sells one at the
// single-total half-value prefill and keeps the other two.
test("inventory: sell lets you pick quantity + a single total; remainder stays", async ({
  page,
}) => {
  await login(page);
  const id = await createCharacter(page.request, {
    name: uniqueName("Gem Trader"),
    className: "Fighter",
  });

  // Seed a 3-stack of custom gear worth 10 gp each (found treasure — no purchase cost).
  const acquire = await page.request.post(`/api/characters/${id}/inventory/transactions`, {
    data: {
      operations: [
        {
          type: "acquire",
          custom: { name: "Ruby", category: "gear", cost: { cp: 0, sp: 0, gp: 10, pp: 0 } },
          quantity: 3,
          currencyDelta: { cp: 0, sp: 0, gp: 0, pp: 0 },
        },
      ],
    },
  });
  expect(acquire.ok(), `acquire: ${acquire.status()}`).toBeTruthy();

  const errors = collectConsoleErrors(page);
  await page.goto(`/characters/${id}`);
  await expect(page.getByRole("heading", { name: "Inventory", exact: true })).toBeVisible();

  // Enter select mode, pick the stack, open the sell review.
  await page.getByRole("button", { name: "Sell items" }).click();
  await page.getByRole("checkbox", { name: "Select Ruby" }).check();
  await page.getByRole("button", { name: "Sell", exact: true }).click();

  // Prefill: quantity is the full stack; the single sale total is half catalog value.
  const qty = page.getByRole("spinbutton", { name: "Quantity to sell of Ruby" });
  const total = page.getByRole("spinbutton", { name: "Total gold received" });
  await expect(qty).toHaveValue("3");
  await expect(total).toHaveValue("15");

  // Sell only one — the auto total follows the quantity down to the single-unit half value.
  await qty.fill("1");
  await expect(total).toHaveValue("5");
  await expect(page.getByText("= 5 gp")).toBeVisible();

  await page.getByRole("button", { name: "Sell", exact: true }).click();

  // Two rubies remain, and the purse reflects exactly the amount received.
  await expect(page.getByText("Ruby")).toBeVisible();
  await expect(page.getByText(/2x/)).toBeVisible();
  await expect(page.getByText("5 gp")).toBeVisible();

  expect(errors).toEqual([]);
});
