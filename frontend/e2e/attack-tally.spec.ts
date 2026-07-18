import { expect, test } from "@playwright/test";

import { login } from "./helpers/auth";
import { collectConsoleErrors } from "./helpers/console";
import { findCharacterByName } from "./helpers/api";

// Shared setup: deterministic dice (face = 1 + floor(0.5 * faces) → d20 always
// 11, never nat 20/1, so no auto-verdict steals the manual-call paths under
// test), then drive the Battle Master persona (Fighter L5, Extra Attack → 2
// attacks) into an active turn with the Attack sheet open.
async function openAttackSheet(page: import("@playwright/test").Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    Math.random = () => 0.5;
  });
  await login(page);
  const id = await findCharacterByName(page.request, "Battle Master");

  const errors = collectConsoleErrors(page);
  await page.goto(`/characters/${id}`);
  // Mobile header has no h1 (#1027 — the identity is a "Switch character" button);
  // that button appearing confirms the sheet rendered.
  await expect(page.getByRole("button", { name: "Switch character" })).toBeVisible();

  await page.getByRole("button", { name: /(Start|Resume|Join) session|Go to fight/i }).click();
  await expect(page).toHaveURL(/[?&]tab=combat/);

  await page.getByRole("button", { name: /Start combat/i }).click();
  await page.getByRole("button", { name: "Start my turn" }).click();

  await page.getByRole("button", { name: /Use Action/ }).click();
  await page.getByRole("button", { name: "Attack", exact: true }).click();
  return { errors, sheet: page.getByRole("dialog") };
}

// #802/#811: rolling damage is an implicit hit, an un-called attack stays
// "unresolved" and never reads as a hit, and the "Turn summary" banner (#812)
// resolves skipped lines inline. Dismissal survives a reload.
test("attack tally: implicit hit, Resume, banner miss call, dismiss survives reload (mobile)", async ({ page }) => {
  const { errors, sheet } = await openAttackSheet(page);

  // Attack 1 → the tally strip appears; the un-called row asks "hit or miss?".
  await sheet.getByRole("button", { name: "Roll to hit" }).click();
  await expect(sheet.getByText("This action")).toBeVisible();
  await expect(sheet.getByText(/Ask your DM/)).toBeVisible();

  // Rolling damage is the implicit hit call (#811): the row resolves to Hit.
  await sheet.getByRole("button", { name: "Roll damage", exact: true }).click();
  await expect(sheet.getByText("✓ Hit")).toBeVisible();

  // Close with one attack unspent — the action stays live for Resume.
  await sheet.getByRole("button", { name: "Close" }).last().click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const resume = page.getByRole("button", { name: /Resume attack — 1 of 2 remaining/ });
  await expect(resume).toBeVisible();

  // Reopen — the tally still holds attack 1; roll attack 2 and leave it un-called.
  await resume.click();
  await expect(sheet.getByText("This action")).toBeVisible();
  await sheet.getByRole("button", { name: /Roll to hit — attack 2 of 2/ }).click();
  await sheet.getByRole("button", { name: /^Done$/ }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // Turn-summary banner: attack 2 never claims a hit — it asks, and resolving
  // Miss inline settles the line.
  await expect(page.getByText("Turn summary")).toBeVisible();
  const question = page.getByRole("button", { name: "hit or miss?" });
  await expect(question).toBeVisible();
  await question.click();
  await page.getByRole("button", { name: /^Miss — / }).click();
  await expect(page.getByText(/miss \(to-hit \d+\)/)).toBeVisible();
  await expect(page.getByRole("button", { name: "hit or miss?" })).toHaveCount(0);

  // Dismiss clears the persisted tally (#812) — a reload mid-turn must not
  // resurrect the banner from the localStorage turn snapshot.
  await page.getByRole("button", { name: /Dismiss/ }).click();
  await expect(page.getByText("Turn summary")).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("button", { name: "End turn" })).toBeVisible();
  await expect(page.getByText("Turn summary")).toHaveCount(0);

  expect(errors).toEqual([]);
});

// The banner's inline damage roll: a skipped attack resolved as Hit grows a
// Roll-damage button on the line itself — no sheet reopen (#811).
test("banner inline resolve: Hit grows an on-line damage roll (mobile)", async ({ page }) => {
  const { errors, sheet } = await openAttackSheet(page);

  // Roll attack 1, skip to attack 2, roll it, close — both rows unresolved.
  await sheet.getByRole("button", { name: "Roll to hit" }).click();
  await sheet.getByRole("button", { name: /Skip — roll next attack/ }).click();
  await sheet.getByRole("button", { name: /Roll to hit — attack 2 of 2/ }).click();
  await sheet.getByRole("button", { name: /^Done$/ }).click();

  // Two unresolved lines; resolve the first as a Hit → inline Roll damage.
  const questions = page.getByRole("button", { name: "hit or miss?" });
  await expect(questions).toHaveCount(2);
  await questions.first().click();
  await page.getByRole("button", { name: /^Hit — / }).click();
  await page.getByRole("button", { name: /^Roll damage — / }).click();
  await expect(page.getByText(/hit — to-hit \d+ — \d+ damage/)).toBeVisible();

  expect(errors).toEqual([]);
});

// #834: a resolved attack's continue button reads "Next" and re-arms step 1
// instead of instantly re-rolling — the player gets a beat to re-orient (e.g.
// switch attack forms) before committing to the next roll.
test("resolved attack: Next re-arms step 1 for a two-tap next roll (mobile)", async ({ page }) => {
  const { errors, sheet } = await openAttackSheet(page);

  // Resolve attack 1 (damage = implicit hit).
  await sheet.getByRole("button", { name: "Roll to hit" }).click();
  await sheet.getByRole("button", { name: "Roll damage", exact: true }).click();
  await expect(sheet.getByText("✓ Hit")).toBeVisible();

  // The continue affordance is a plain "Next" — no instant re-roll button.
  await expect(
    sheet.getByRole("button", { name: /Roll to hit — attack 2 of 2/ }),
  ).toHaveCount(0);
  const next = sheet.getByRole("button", { name: "Next" });
  await expect(next).toBeVisible();
  await next.click();

  // Card resets to step 1 — armed with the right ordinal, not an already-rolled attack 2.
  await expect(sheet.getByText("✓ Hit")).toHaveCount(0);
  const rollAttack2 = sheet.getByRole("button", { name: /Roll to hit — attack 2 of 2/ });
  await expect(rollAttack2).toBeVisible();
  await rollAttack2.click();
  await expect(sheet.getByText(/Ask your DM/)).toBeVisible();

  expect(errors).toEqual([]);
});
