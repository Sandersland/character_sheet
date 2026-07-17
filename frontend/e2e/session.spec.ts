import { expect, test } from "@playwright/test";

import { login } from "./helpers/auth";
import { collectConsoleErrors } from "./helpers/console";

// #962: the legacy /session route redirects to the sheet's Combat tab (bookmarks).
test("session: /characters/:id/session redirects to the Combat tab", async ({ page }) => {
  await login(page);
  await page.getByRole("link", { name: /Session Fighter/ }).click();
  await expect(page).toHaveURL(/\/characters\/[^/?]+$/);
  const base = page.url();
  await page.goto(`${base}/session`);
  await expect(page).toHaveURL(/[?&]tab=combat/);
});

// Uses the Session Fighter roster persona (seeded with its own campaign so a
// live session can be started/resumed here). The session button resolves to
// Start/Resume/Join depending on leftover state — any of them lands on /session.
// #963: the doorway lands on the Combat tab in-workspace (?tab=combat), where
// the live turn tracker runs. (The Session Log lives on /session's reference
// tabs; its move to a Turn/Log sub-nav under Combat is #962, so the log
// assertion returns then.)
test("session: start combat and take an action from the Combat tab", async ({ page }) => {
  await login(page);

  const errors = collectConsoleErrors(page);
  await page.getByRole("link", { name: /Session Fighter/ }).click();
  await page.getByRole("button", { name: /(Start|Resume|Join) session|Go to fight/i }).click();
  await expect(page).toHaveURL(/[?&]tab=combat/);

  await page.getByRole("button", { name: /Start combat/i }).click();
  await page.getByRole("button", { name: "Start my turn" }).click();

  // Action economy shows the action available, then consumed after Dodge.
  await expect(page.getByRole("button", { name: "Use Action" })).toBeVisible();
  await page.getByRole("button", { name: /Use Action/ }).click();
  await page.getByRole("button", { name: "Dodge" }).click();
  await expect(page.getByRole("button", { name: "Use Action" })).toHaveCount(0);

  expect(errors).toEqual([]);
});

// #765: opening the item picker and closing it without using anything must not
// spend the Action — the slot commits only on use.
test("session: opening Use-an-item then closing leaves the action available", async ({ page }) => {
  await login(page);

  const errors = collectConsoleErrors(page);
  await page.getByRole("link", { name: /Session Fighter/ }).click();
  await page.getByRole("button", { name: /(Start|Resume|Join) session|Go to fight/i }).click();
  await expect(page).toHaveURL(/[?&]tab=combat/);

  await page.getByRole("button", { name: /Start combat/i }).click();
  await page.getByRole("button", { name: "Start my turn" }).click();

  await page.getByRole("button", { name: /Use Action/ }).click();
  await page.getByRole("button", { name: "Use an item" }).click();

  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText(/Nothing is spent until you use an item/)).toBeVisible();
  await sheet.getByRole("button", { name: "Close" }).click();

  // Action untouched — no commit, no undo affordance.
  await expect(page.getByRole("button", { name: "Use Action" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Undo/ })).toHaveCount(0);

  expect(errors).toEqual([]);
});

// #958: the global docked NORMAL/ADV/DIS footer is retired — roll mode rides
// the roll surface now (long-press menu on skills/saves; a visible control on
// the attack sheet). This asserts the footer is gone and the turn flow still
// works without it.
test("session: the global roll-mode footer is retired (mobile)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);

  const errors = collectConsoleErrors(page);
  await page.getByRole("link", { name: /Session Fighter/ }).click();
  await page.getByRole("button", { name: /(Start|Resume|Join) session|Go to fight/i }).click();
  await expect(page).toHaveURL(/[?&]tab=combat/);

  // No docked footer and no global "Roll mode" group anywhere.
  await expect(page.getByTestId("roll-mode-bar")).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Roll mode" })).toHaveCount(0);

  // The turn flow is unaffected by the footer's removal.
  await page.getByRole("button", { name: /Start combat/i }).click();
  await page.getByRole("button", { name: "Start my turn" }).click();
  await page.getByRole("button", { name: /Use Action/ }).click();
  await expect(page.getByRole("button", { name: "Dodge" })).toBeVisible();

  expect(errors).toEqual([]);
});

// #956: rolling to hit inside the attack sheet surfaces the result SEAL on top
// of the sheet — it is NEVER suppressed behind the scrim (inverting the old
// #801 behavior: the seal owns a z tier above dialogs so an in-sheet roll is
// always visible).
test("session: the result seal shows over the open attack sheet (mobile)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);

  const errors = collectConsoleErrors(page);
  await page.getByRole("link", { name: /Session Fighter/ }).click();
  await page.getByRole("button", { name: /(Start|Resume|Join) session|Go to fight/i }).click();
  await expect(page).toHaveURL(/[?&]tab=combat/);

  await page.getByRole("button", { name: /Start combat/i }).click();
  await page.getByRole("button", { name: "Start my turn" }).click();
  await page.getByRole("button", { name: /Use Action/ }).click();
  await page.getByRole("button", { name: "Attack", exact: true }).click();

  const sheet = page.getByRole("dialog");
  const seal = page.locator('[data-testid="roll-result-seal"]');

  await sheet.getByRole("button", { name: "Roll to hit" }).click();

  // The result seal appears on top of the open sheet — not suppressed (#956);
  // the attack card still shows its own inline result too.
  await expect(seal).toBeVisible();
  await expect(sheet.getByText("=").first()).toBeVisible();

  expect(errors).toEqual([]);
});

// #815: the mid-turn weapon change lives inside the Action sheet ("Change
// weapons" card), no longer a slot-root row. The Session Fighter is Unarmed
// (empty hands, empty bag), so this asserts the card opens the per-hand picker
// cleanly; the gating/free-draw permutations are covered by the
// InlineLoadoutPicker + loadoutPicker unit suites.
test("session: Change weapons in the Action sheet opens the per-hand picker on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);

  const errors = collectConsoleErrors(page);
  await page.getByRole("link", { name: /Session Fighter/ }).click();
  await page.getByRole("button", { name: /(Start|Resume|Join) session|Go to fight/i }).click();
  await expect(page).toHaveURL(/[?&]tab=combat/);

  await page.getByRole("button", { name: /Start combat/i }).click();
  await page.getByRole("button", { name: "Start my turn" }).click();

  // There is no slot-root loadout row anymore.
  await expect(page.getByText(/Equipped ·/)).toHaveCount(0);

  // Open the Action sheet, then the "Change weapons" card.
  await page.getByRole("button", { name: "Use Action" }).click();
  const actionSheet = page.getByRole("dialog");
  await actionSheet.getByRole("button", { name: "Change weapons" }).click();

  // The picker is the per-hand card layout, not a flat candidate list.
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText(/Now wielding/)).toBeVisible();
  await expect(sheet.getByText(/Main hand/)).toBeVisible();
  await expect(sheet.getByText(/Off hand/)).toBeVisible();

  expect(errors).toEqual([]);
});
