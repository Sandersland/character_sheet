import { expect, test } from "@playwright/test";

import { login } from "./helpers/auth";
import { collectConsoleErrors } from "./helpers/console";

// Uses the Monk L6 roster persona: at monk level 6 Ki-Empowered Strikes marks
// unarmed strikes magical, surfaced as a "Magical" badge on the attack card's
// summary when Unarmed Strike is picked in the "Attacking with" selector (#786).
test("unarmed: Monk L6 shows the Ki-Empowered Strikes magical badge", async ({ page }) => {
  await login(page);

  const errors = collectConsoleErrors(page);
  await page.getByRole("link", { name: /Monk L6/ }).click();
  await page.getByRole("button", { name: /(Start|Resume|Join) Session/ }).click();
  await expect(page).toHaveURL(/\/session$/);

  await page.getByRole("button", { name: /Start combat/i }).click();
  await page.getByRole("button", { name: "Start my turn" }).click();

  await page.getByRole("button", { name: /Use Action/ }).click();
  await page.getByRole("button", { name: "Attack", exact: true }).click();

  // Unarmed Strike is a form segment now — select it, then the card summary
  // carries the Ki-Empowered "Magical" badge.
  await page.getByRole("radio", { name: "Unarmed Strike" }).click();
  await expect(page.getByText("Magical")).toBeVisible();

  expect(errors).toEqual([]);
});
