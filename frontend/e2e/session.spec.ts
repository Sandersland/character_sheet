import { expect, test } from "@playwright/test";

import { login } from "./helpers/auth";
import { enterLiveCombat, startCombatAndTurn } from "./helpers/api";
import { collectConsoleErrors } from "./helpers/console";

test("session: /characters/:id/session redirects to the Combat tab", async ({ page }) => {
  await login(page);
  await page.getByRole("link", { name: /Session Fighter/ }).click();
  await expect(page).toHaveURL(/\/characters\/[^/?]+$/);
  const base = page.url();
  await page.goto(`${base}/session`);
  await expect(page).toHaveURL(/[?&]tab=combat/);
});

test("session: start combat and take an action from the Combat tab", async ({ page }) => {
  await login(page);

  const errors = collectConsoleErrors(page);
  await page.getByRole("link", { name: /Session Fighter/ }).click();
  await enterLiveCombat(page);
  await expect(page).toHaveURL(/[?&]tab=combat/);

  await startCombatAndTurn(page);

  await expect(page.getByRole("button", { name: "Use Action" })).toBeVisible();
  await page.getByRole("button", { name: /Use Action/ }).click();
  await page.getByRole("button", { name: "Dodge" }).click();
  await expect(page.getByRole("button", { name: "Use Action" })).toHaveCount(0);

  expect(errors).toEqual([]);
});

test("session: desktop live Combat has no rails; a roll lands in the on-demand log overlay", async ({ page }) => {
  await login(page);

  const errors = collectConsoleErrors(page);
  await page.getByRole("link", { name: /Session Fighter/ }).click();
  await enterLiveCombat(page);
  await expect(page).toHaveURL(/[?&]tab=combat/);

  await expect(
    page.getByRole("complementary", { name: /Ability checks, saves, and skills/i }),
  ).toHaveCount(0);
  await expect(page.getByRole("complementary", { name: /Session log/i })).toHaveCount(0);

  await expect(page.getByRole("tab", { name: /Combat \(session live\)/i })).toBeVisible();

  await startCombatAndTurn(page);
  await page.getByRole("button", { name: /Use Action/ }).click();
  await page.getByRole("button", { name: "Attack", exact: true }).click();
  const attackSheet = page.getByRole("dialog");
  await attackSheet.getByRole("button", { name: /Roll to hit/ }).first().click();
  // DamageStepContent hides Roll-damage on a die-locked miss, so only an
  // implicit hit needs this click.
  const damage = attackSheet.getByRole("button", { name: /Roll (crit )?damage/ });
  if (await damage.count()) await damage.click();
  const done = attackSheet.getByRole("button", { name: /^Done$/ });
  // ResolutionRail's "Done" commits the swing without closing the sheet;
  // AttackSheetFooter then relabels its own close button to "Done" too (same
  // handler, same accessible name) — this second click is that one.
  // BottomSheet renders role="dialog" on both breakpoints, so this holds here
  // exactly as it does on mobile.
  await done.click();
  await done.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.getByRole("button", { name: /open session log/i }).click();
  const logDrawer = page.getByRole("dialog", { name: "Session Log" });
  await expect(logDrawer.getByText(/hit for |missed|critical hit/).first()).toBeVisible();

  expect(errors).toEqual([]);
});

test("session: opening Use-an-item then closing leaves the action available", async ({ page }) => {
  await login(page);

  const errors = collectConsoleErrors(page);
  await page.getByRole("link", { name: /Session Fighter/ }).click();
  await enterLiveCombat(page);
  await expect(page).toHaveURL(/[?&]tab=combat/);

  await startCombatAndTurn(page);

  await page.getByRole("button", { name: /Use Action/ }).click();
  await page.getByRole("button", { name: "Use an item" }).click();

  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText(/Nothing is spent until you use an item/)).toBeVisible();
  await sheet.getByRole("button", { name: "Close" }).click();

  await expect(page.getByRole("button", { name: "Use Action" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Undo/ })).toHaveCount(0);

  expect(errors).toEqual([]);
});

test("session: the global roll-mode footer is retired (mobile)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);

  const errors = collectConsoleErrors(page);
  await page.getByRole("link", { name: /Session Fighter/ }).click();
  await enterLiveCombat(page);
  await expect(page).toHaveURL(/[?&]tab=combat/);

  await expect(page.getByTestId("roll-mode-bar")).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Roll mode" })).toHaveCount(0);

  await startCombatAndTurn(page);
  await page.getByRole("button", { name: /Use Action/ }).click();
  await expect(page.getByRole("button", { name: "Dodge" })).toBeVisible();

  expect(errors).toEqual([]);
});

test("session: the result seal shows over the open attack sheet (mobile)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);

  const errors = collectConsoleErrors(page);
  await page.getByRole("link", { name: /Session Fighter/ }).click();
  await enterLiveCombat(page);
  await expect(page).toHaveURL(/[?&]tab=combat/);

  await startCombatAndTurn(page);
  await page.getByRole("button", { name: /Use Action/ }).click();
  await page.getByRole("button", { name: "Attack", exact: true }).click();

  const sheet = page.getByRole("dialog");
  const seal = page.locator('[data-testid="roll-result-seal"]');

  await sheet.getByRole("button", { name: "Roll to hit" }).click();

  await expect(seal).toBeVisible();
  await expect(sheet.getByText("=").first()).toBeVisible();

  expect(errors).toEqual([]);
});

test("session: Change weapons in the Action sheet opens the per-hand picker on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);

  const errors = collectConsoleErrors(page);
  await page.getByRole("link", { name: /Session Fighter/ }).click();
  await enterLiveCombat(page);
  await expect(page).toHaveURL(/[?&]tab=combat/);

  await startCombatAndTurn(page);

  await expect(page.getByText(/Equipped ·/)).toHaveCount(0);

  await page.getByRole("button", { name: "Use Action" }).click();
  const actionSheet = page.getByRole("dialog");
  await actionSheet.getByRole("button", { name: "Change weapons" }).click();

  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText(/Now wielding/)).toBeVisible();
  await expect(sheet.getByText(/Main hand/)).toBeVisible();
  await expect(sheet.getByText(/Off hand/)).toBeVisible();

  expect(errors).toEqual([]);
});
