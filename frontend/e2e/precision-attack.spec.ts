import { expect, test } from "@playwright/test";

import { login } from "./helpers/auth";
import { collectConsoleErrors } from "./helpers/console";
import { findCharacterByName, learnManeuver, restoreResourcePool } from "./helpers/api";

// #809: Precision Attack (an attackRoll maneuver) is hosted UNDER the attack card,
// beneath its result line — not on the damage card. Spending it after a to-hit
// boosts the to-hit total (the "(+maneuver)" marker) and decrements a die. The
// Battle Master persona is Fighter L5; it doesn't know Precision by default, so
// we teach it via the API first.
test("precision attack: the affordance is under the attack card and boosts the to-hit", async ({ page }) => {
  await login(page);
  const id = await findCharacterByName(page.request, "Battle Master");
  await learnManeuver(page.request, id, "Precision Attack");
  await restoreResourcePool(page.request, id, "superiorityDice");

  const errors = collectConsoleErrors(page);
  await page.goto(`/characters/${id}`);
  await expect(page.getByRole("heading", { name: /Battle Master/, level: 1 })).toBeVisible();

  await page.getByRole("button", { name: /(Start|Resume|Join) Session/ }).click();
  await expect(page).toHaveURL(/\/session$/);

  await page.getByRole("button", { name: /Start combat/i }).click();
  await page.getByRole("button", { name: "Start my turn" }).click();

  // Open the Attack sheet.
  await page.getByRole("button", { name: /Use Action/ }).click();
  await page.getByRole("button", { name: "Attack", exact: true }).click();
  const sheet = page.getByRole("dialog");

  // Before any to-hit roll, the Precision affordance is absent.
  await expect(sheet.getByText("Add to Attack:")).toHaveCount(0);

  // Roll to hit → the attack card now hosts the Precision affordance (beneath the
  // result line), and the damage card shows no maneuver section yet.
  await sheet.getByRole("button", { name: "Roll to hit" }).click();
  await expect(sheet.getByText("Add to Attack:")).toBeVisible();
  await expect(sheet.getByText("Add to Damage:")).toHaveCount(0);

  // Spend it → the to-hit total is boosted (the (+maneuver) marker on the line).
  await sheet.getByRole("button", { name: /Precision Attack/ }).click();
  await expect(sheet.getByText("(+maneuver)")).toBeVisible();

  expect(errors).toEqual([]);
});
