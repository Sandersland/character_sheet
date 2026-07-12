import { expect, test } from "@playwright/test";

import { login } from "./helpers/auth";
import { collectConsoleErrors } from "./helpers/console";

// Uses the Session Fighter roster persona (seeded with its own campaign so a
// live session can be started/resumed here). The session button resolves to
// Start/Resume/Join depending on leftover state — any of them lands on /session.
test("session: start combat, take an action, and see it in the log", async ({ page }) => {
  await login(page);

  const errors = collectConsoleErrors(page);
  await page.getByRole("link", { name: /Session Fighter/ }).click();
  await page.getByRole("button", { name: /(Start|Resume|Join) Session/ }).click();
  await expect(page).toHaveURL(/\/session$/);

  await page.getByRole("button", { name: /Start combat/i }).click();
  await page.getByRole("button", { name: "Start my turn" }).click();

  // Action economy shows the action available, then consumed after Dodge.
  await expect(page.getByRole("button", { name: "Use Action" })).toBeVisible();
  await page.getByRole("button", { name: /Use Action/ }).click();
  await page.getByRole("button", { name: "Dodge" }).click();
  await expect(page.getByRole("button", { name: "Use Action" })).toHaveCount(0);

  // The combat event is written to the session log.
  await page.getByRole("tab", { name: /Log/ }).click();
  await expect(page.getByText(/No events yet/)).toHaveCount(0);
  await expect(page.getByText("combat", { exact: true }).first()).toBeVisible();

  expect(errors).toEqual([]);
});

// #765: opening the item picker and closing it without using anything must not
// spend the Action — the slot commits only on use.
test("session: opening Use-an-item then closing leaves the action available", async ({ page }) => {
  await login(page);

  const errors = collectConsoleErrors(page);
  await page.getByRole("link", { name: /Session Fighter/ }).click();
  await page.getByRole("button", { name: /(Start|Resume|Join) Session/ }).click();
  await expect(page).toHaveURL(/\/session$/);

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

// #770: on a mobile viewport the roll-mode toggle docks as a fixed full-width
// bottom bar instead of floating over the action controls.
test("session: roll-mode toggle docks as a bottom bar on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);

  const errors = collectConsoleErrors(page);
  await page.getByRole("link", { name: /Session Fighter/ }).click();
  await page.getByRole("button", { name: /(Start|Resume|Join) Session/ }).click();
  await expect(page).toHaveURL(/\/session$/);

  const toggle = page.getByRole("group", { name: "Roll mode" });
  await expect(toggle).toBeVisible();
  await expect(toggle.getByRole("button", { name: /^advantage$/i })).toBeVisible();

  // The outer wrapper is the full-width docked bar; the role=group is the
  // centered inner control, so measure the bar itself for the geometry.
  const bar = page.getByTestId("roll-mode-bar");
  const box = await bar.boundingBox();
  expect(box).not.toBeNull();
  if (box) {
    expect(box.x).toBeLessThan(40);
    expect(box.width).toBeGreaterThan(300);
    expect(box.y + box.height).toBeGreaterThan(844 - 120);
  }

  // Toggling advantage still flips the shared roll mode (aria-pressed).
  const adv = toggle.getByRole("button", { name: /^advantage$/i });
  await adv.click();
  await expect(adv).toHaveAttribute("aria-pressed", "true");

  // A d20 affordance below the bar remains tappable — Playwright's click gate
  // fails if the bar overlaps it.
  await page.getByRole("button", { name: /Start combat/i }).click();
  await page.getByRole("button", { name: "Start my turn" }).click();
  await page.getByRole("button", { name: /Use Action/ }).click();
  await expect(page.getByRole("button", { name: "Dodge" })).toBeVisible();

  expect(errors).toEqual([]);
});

// #789: the mid-turn loadout row opens a per-hand picker (Main/Off cards) at
// mobile width. The Session Fighter is Unarmed (empty hands, empty bag), so this
// asserts the redesigned shell renders + opens cleanly; the gating/free-draw
// permutations are covered by the LoadoutSwapRow + loadoutPicker unit suites.
test("session: loadout Change opens the per-hand picker on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);

  const errors = collectConsoleErrors(page);
  await page.getByRole("link", { name: /Session Fighter/ }).click();
  await page.getByRole("button", { name: /(Start|Resume|Join) Session/ }).click();
  await expect(page).toHaveURL(/\/session$/);

  await page.getByRole("button", { name: /Start combat/i }).click();
  await page.getByRole("button", { name: "Start my turn" }).click();

  // The loadout row shows the current equipped label + a Change button.
  await expect(page.getByText(/Equipped ·/)).toBeVisible();
  await page.getByRole("button", { name: "Change" }).click();

  // The picker is the per-hand card layout, not a flat candidate list.
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText("Change loadout")).toBeVisible();
  await expect(sheet.getByText(/Main hand/)).toBeVisible();
  await expect(sheet.getByText(/Off hand/)).toBeVisible();

  expect(errors).toEqual([]);
});
