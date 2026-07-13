import { expect, test } from "@playwright/test";

import { login } from "./helpers/auth";
import { collectConsoleErrors } from "./helpers/console";
import { findCharacterByName } from "./helpers/api";

// #802: a two-attack (Extra Attack) turn records a per-attack tally, keeps the
// action live for Resume when closed with an attack unspent, and surfaces the
// "Turn summary" banner once every attack is spent (#812). The Battle Master
// persona is Fighter L5 (Extra Attack → 2 attacks per Attack action).
test("attack tally: two-attack turn — tally, Resume, then DM banner (mobile)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  const id = await findCharacterByName(page.request, "Battle Master");

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

  // Attack 1 → the tally strip appears with the first row.
  await sheet.getByRole("button", { name: "Roll to hit" }).click();
  await expect(sheet.getByText("This action")).toBeVisible();
  await sheet.getByRole("button", { name: /Roll (crit )?damage/ }).click();

  // Close with one attack unspent — the action stays live for Resume.
  await sheet.getByRole("button", { name: "Close" }).last().click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const resume = page.getByRole("button", { name: /Resume attack — 1 of 2 remaining/ });
  await expect(resume).toBeVisible();

  // Reopen — the tally still holds attack 1.
  await resume.click();
  await expect(sheet.getByText("This action")).toBeVisible();

  // Attack 2 → both spent → footer reads Done.
  await sheet.getByRole("button", { name: "Roll to hit" }).click();
  await sheet.getByRole("button", { name: /^Done$/ }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // Turn-summary banner surfaces with the tally lines; dismiss clears it.
  await expect(page.getByText("Turn summary")).toBeVisible();
  await page.getByRole("button", { name: /Dismiss/ }).click();
  await expect(page.getByText("Turn summary")).toHaveCount(0);

  // Dismiss clears the persisted tally (#812) — a reload mid-turn must not
  // resurrect the banner from the localStorage turn snapshot.
  await page.reload();
  await expect(page.getByRole("button", { name: "End turn" })).toBeVisible();
  await expect(page.getByText("Turn summary")).toHaveCount(0);

  expect(errors).toEqual([]);
});
