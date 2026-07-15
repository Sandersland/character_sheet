import { expect, test } from "@playwright/test";

import { login } from "./helpers/auth";
import { collectConsoleErrors } from "./helpers/console";
import { createCharacter, gotoSheet, uniqueName } from "./helpers/api";

// Equip an unequipped bag weapon onto the "Worn" loadout list: switch views,
// open the empty Main hand row's ＋ Equip picker, pick the weapon, and assert it
// now fills the Main hand row.
test("paper doll: equip a bag item into a slot from the Worn view", async ({ page }) => {
  await login(page);
  const id = await createCharacter(page.request, {
    name: uniqueName("Doll Fighter"),
    className: "Fighter",
  });

  // Seed a one-handed weapon straight into the bag (twoHanded defaults false).
  const acquire = await page.request.post(`/api/characters/${id}/inventory/transactions`, {
    data: {
      operations: [
        {
          type: "acquire",
          custom: {
            name: "Test Blade",
            category: "weapon",
            weapon: { damageDiceCount: 1, damageDiceFaces: 8, damageType: "slashing" },
          },
          quantity: 1,
          currencyDelta: { cp: 0, sp: 0, gp: 0, pp: 0 },
        },
      ],
    },
  });
  expect(acquire.ok(), `acquire: ${acquire.status()}`).toBeTruthy();

  const errors = collectConsoleErrors(page);
  await gotoSheet(page, id, "inventory");
  await expect(page.getByRole("heading", { name: "Inventory", exact: true })).toBeVisible();

  // Switch the Inventory card to the paper-doll Worn view.
  await page.getByRole("radio", { name: "Worn" }).click();

  // The Main hand starts empty; open its ＋ Equip picker and choose the blade.
  await page.getByRole("button", { name: "Equip Main hand" }).click();
  await expect(page.getByText("Equip Main hand")).toBeVisible();
  await page.getByRole("button", { name: /Test Blade/ }).click();

  // The blade now fills the Main hand row (its actions Popover trigger).
  await expect(page.getByRole("button", { name: /Main hand: Test Blade/ })).toBeVisible();
  // …and the empty-row ＋ Equip affordance is gone.
  await expect(page.getByRole("button", { name: "Equip Main hand" })).toHaveCount(0);

  expect(errors).toEqual([]);
});
