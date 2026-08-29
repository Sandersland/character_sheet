import { expect, test } from "@playwright/test";

import { login } from "./helpers/auth";
import { collectConsoleErrors } from "./helpers/console";
import { enterLiveCombat, createCharacter, createSessionCharacter, gotoSheet, uniqueName } from "./helpers/api";

test("inventory: add catalog item shows weight/qty; equip/unequip drives the attack selector", async ({
  page,
}) => {
  await login(page);
  const id = await createSessionCharacter(page.request, {
    name: uniqueName("Pack Fighter"),
    className: "Fighter",
  });

  const errors = collectConsoleErrors(page);
  await gotoSheet(page, id, "inventory");
  await expect(page.getByRole("heading", { name: "Inventory", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "+ Add item" }).first().click();
  await page.getByLabel("Item").selectOption({ label: "Dagger" });
  await page.getByLabel("Quantity").fill("2");
  await page.getByLabel("gp", { exact: true }).fill("0");
  await page.getByRole("button", { name: "Add", exact: true }).click();

  await expect(page.getByText("Dagger")).toBeVisible();
  await expect(page.getByText(/2x · 2 lb/)).toBeVisible();

  await page.getByRole("button", { name: "Equip", exact: true }).click();
  await expect(page.getByRole("button", { name: "Equipped" })).toBeVisible();

  await enterLiveCombat(page);
  await expect(page).toHaveURL(/[?&]tab=combat/);

  await page.getByRole("button", { name: /Start combat/i }).click();
  await page.getByRole("button", { name: "Start my turn" }).click();
  await page.getByRole("button", { name: /Use Action/ }).click();
  await page.getByRole("button", { name: "Attack", exact: true }).click();

  await expect(page.getByText(/no target AC tracked/i)).toBeVisible();
  await expect(page.getByRole("radio", { name: "Dagger" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Roll to hit/ })).toBeVisible();

  await page.keyboard.press("Escape");
  expect(errors).toEqual([]);
});

test("inventory: sell lets you pick quantity + a single total; remainder stays", async ({
  page,
}) => {
  await login(page);
  const id = await createCharacter(page.request, {
    name: uniqueName("Gem Trader"),
    className: "Fighter",
  });

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
  await gotoSheet(page, id, "inventory");
  await expect(page.getByRole("heading", { name: "Inventory", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Sell items" }).click();
  await page.getByRole("checkbox", { name: "Select Ruby" }).check();
  await page.getByRole("button", { name: "Sell", exact: true }).click();

  const qty = page.getByRole("spinbutton", { name: "Quantity to sell of Ruby" });
  const total = page.getByRole("spinbutton", { name: "Total gold received" });
  await expect(qty).toHaveValue("3");
  await expect(total).toHaveValue("15");

  await qty.fill("1");
  await expect(total).toHaveValue("5");
  await expect(page.getByText("= 5 gp")).toBeVisible();

  await page.getByRole("button", { name: "Sell", exact: true }).click();

  await expect(page.getByText("Ruby")).toBeVisible();
  await expect(page.getByText(/2x/)).toBeVisible();
  await expect(page.getByText("5 gp")).toBeVisible();

  expect(errors).toEqual([]);
});
