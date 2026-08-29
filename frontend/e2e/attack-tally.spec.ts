import { expect, test } from "@playwright/test";

import { login } from "./helpers/auth";
import { collectConsoleErrors } from "./helpers/console";
import { enterLiveCombat, findCharacterByName, startCombatAndTurn } from "./helpers/api";

async function openAttackSheet(page: import("@playwright/test").Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    Math.random = () => 0.5;
  });
  await login(page);
  const id = await findCharacterByName(page.request, "Battle Master");

  const errors = collectConsoleErrors(page);
  await page.goto(`/characters/${id}`);
  // Mobile header has no h1 (#1027) — "Switch character" is the render signal.
  await expect(page.getByRole("button", { name: "Switch character" })).toBeVisible();

  await enterLiveCombat(page);
  await expect(page).toHaveURL(/[?&]tab=combat/);

  await startCombatAndTurn(page);

  await page.getByRole("button", { name: /Use Action/ }).click();
  await page.getByRole("button", { name: "Attack", exact: true }).click();
  return { errors, sheet: page.getByRole("dialog") };
}

test("attack tally: implicit hit auto-advances the rail; a swing closed mid-roll resolves via Resume + the Turn summary banner; dismiss survives reload (mobile)", async ({ page }) => {
  const { errors, sheet } = await openAttackSheet(page);

  await sheet.getByRole("button", { name: "Roll to hit" }).click();
  await expect(sheet.getByText("This action")).toBeVisible();
  await expect(sheet.getByText(/Ask your DM/)).toBeVisible();

  await sheet.getByRole("button", { name: "Roll damage", exact: true }).click();
  await expect(sheet.getByText("✓ Hit")).toBeVisible();

  await sheet.getByRole("button", { name: /^Done$/ }).click();
  await expect(sheet.getByText("✓ Hit")).toHaveCount(0);
  await expect(sheet.getByRole("button", { name: "Roll to hit" })).toBeVisible();

  await sheet.getByRole("button", { name: "Close" }).last().click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const resume = page.getByRole("button", { name: /Resume attack — 1 of 2 remaining/ });
  await expect(resume).toBeVisible();

  await resume.click();
  await expect(sheet.getByText("This action")).toBeVisible();
  await sheet.getByRole("button", { name: "Roll to hit" }).click();
  await sheet.getByRole("button", { name: "Close" }).last().click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await expect(page.getByText("Turn summary")).toBeVisible();
  const question = page.getByRole("button", { name: "hit or miss?" });
  await expect(question).toBeVisible();
  await question.click();
  await page.getByRole("button", { name: /^Miss — / }).click();
  await expect(page.getByText(/miss \(to-hit \d+\)/)).toBeVisible();
  await expect(page.getByRole("button", { name: "hit or miss?" })).toHaveCount(0);

  await page.getByRole("button", { name: /Dismiss/ }).click();
  await expect(page.getByText("Turn summary")).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("button", { name: "End turn" })).toBeVisible();
  await expect(page.getByText("Turn summary")).toHaveCount(0);

  expect(errors).toEqual([]);
});

test("banner inline resolve: Hit grows an on-line damage roll (mobile)", async ({ page }) => {
  const { errors, sheet } = await openAttackSheet(page);

  await sheet.getByRole("button", { name: "Roll to hit" }).click();
  await sheet.getByRole("button", { name: "Close" }).last().click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.getByRole("button", { name: /Resume attack — 1 of 2 remaining/ }).click();
  const sheet2 = page.getByRole("dialog");
  await expect(sheet2.getByText("This action")).toBeVisible();
  await sheet2.getByRole("button", { name: "Roll to hit" }).click();
  await sheet2.getByRole("button", { name: "Close" }).last().click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  const questions = page.getByRole("button", { name: "hit or miss?" });
  await expect(questions).toHaveCount(2);
  await questions.first().click();
  await page.getByRole("button", { name: /^Hit — / }).click();
  await page.getByRole("button", { name: /^Roll damage — / }).click();
  await expect(page.getByText(/hit — to-hit \d+ — \d+ damage/)).toBeVisible();

  expect(errors).toEqual([]);
});

test("resolved attack: Done commits one swing and auto-re-arms step 1 for the next (mobile)", async ({ page }) => {
  const { errors, sheet } = await openAttackSheet(page);

  await sheet.getByRole("button", { name: "Roll to hit" }).click();
  await sheet.getByRole("button", { name: "Roll damage", exact: true }).click();
  await expect(sheet.getByText("✓ Hit")).toBeVisible();

  const done = sheet.getByRole("button", { name: /^Done$/ });
  await expect(done).toBeVisible();
  await done.click();

  await expect(sheet.getByText("✓ Hit")).toHaveCount(0);
  const rollAttack2 = sheet.getByRole("button", { name: "Roll to hit" });
  await expect(rollAttack2).toBeVisible();
  await rollAttack2.click();
  await expect(sheet.getByText(/Ask your DM/)).toBeVisible();

  expect(errors).toEqual([]);
});
