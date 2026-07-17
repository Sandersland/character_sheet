import { expect, test } from "@playwright/test";

import { login } from "./helpers/auth";
import { collectConsoleErrors } from "./helpers/console";
import { findCharacterByName, learnManeuver, restoreResourcePool } from "./helpers/api";

// #809/#811: Precision Attack (an attackRoll maneuver) lives behind the Battle
// Master maneuvers disclosure in the attack sheet, showing its attack section
// only once a to-hit roll exists. Spending it boosts the to-hit total (the
// "(+maneuver)" marker) and decrements a die. The Battle Master persona is
// Fighter L5; it doesn't know Precision by default, so we teach it via the API.
test("precision attack: the affordance is under the attack card and boosts the to-hit", async ({ page }) => {
  await login(page);
  const id = await findCharacterByName(page.request, "Battle Master");
  await learnManeuver(page.request, id, "Precision Attack");
  await restoreResourcePool(page.request, id, "superiorityDice");

  const errors = collectConsoleErrors(page);
  await page.goto(`/characters/${id}`);
  await expect(page.getByRole("heading", { name: /Battle Master/, level: 1 })).toBeVisible();

  await page.getByRole("button", { name: /(Start|Resume|Join) session|Go to fight/i }).click();
  await expect(page).toHaveURL(/[?&]tab=combat/);

  await page.getByRole("button", { name: /Start combat/i }).click();
  await page.getByRole("button", { name: "Start my turn" }).click();

  // Open the Attack sheet.
  await page.getByRole("button", { name: /Use Action/ }).click();
  await page.getByRole("button", { name: "Attack", exact: true }).click();
  const sheet = page.getByRole("dialog");

  // Before any to-hit roll, opening the maneuvers disclosure shows no Precision
  // affordance (it attaches to a roll).
  await sheet.getByRole("button", { name: /Battle Master maneuvers/ }).click();
  await expect(sheet.getByText("Add to Attack:")).toHaveCount(0);

  // Roll to hit → the disclosure hosts the Precision affordance; no damage
  // maneuver section yet (no damage roll).
  await sheet.getByRole("button", { name: "Roll to hit" }).click();
  await expect(sheet.getByText("Add to Attack:")).toBeVisible();
  await expect(sheet.getByText("Add to Damage:")).toHaveCount(0);

  // Spend it → the to-hit total is boosted (the (+maneuver) marker on the line).
  await sheet.getByRole("button", { name: /Precision Attack/ }).click();
  await expect(sheet.getByText("(+maneuver)")).toBeVisible();

  expect(errors).toEqual([]);
});
