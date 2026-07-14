import { expect, test } from "@playwright/test";

import { login } from "./helpers/auth";
import { collectConsoleErrors } from "./helpers/console";

// The Quick-capture surface presents per-breakpoint (#771): the non-modal margin
// dock at md+ (#865), the slide-up BottomSheet below md. Opened with Cmd/Ctrl+J so
// the flow is viewport-independent (no reliance on a header button that may
// reflow on mobile).
test("Quick capture: margin dock at md+, BottomSheet on mobile", async ({ page }) => {
  await login(page);
  // Collect after login so the pre-auth 401s from login()'s initial goto don't count.
  const errors = collectConsoleErrors(page);
  await page.getByRole("link", { name: /Smoke Fighter/ }).click();
  await expect(page.getByRole("heading", { name: "Hit Points" })).toBeVisible();

  const grabber = page.locator('button[aria-label="Close"]');
  const enterHint = page.getByText(/↵ save · shift\+↵ new line/);

  // md+ (the config's 1280×800 default): the non-modal margin dock (#865). The
  // note field is focused, the dock shows its "Close · ⌘J" affordance and the
  // ↵/shift keyboard hint, and there's no mobile grabber handle. It's non-modal
  // (no aria-modal), so the sheet behind stays interactive — its own Close
  // control carries no aria-label, so the mobile grabber locator stays exclusive.
  await page.keyboard.press("Control+j");
  await expect(page.getByRole("textbox", { name: /quick note/i })).toBeFocused();
  const dock = page.locator("[data-capture-dock]");
  await expect(dock).toBeVisible();
  await expect(dock).not.toHaveAttribute("aria-modal", "true");
  await expect(page.getByRole("button", { name: /close · ⌘j/i })).toBeVisible();
  await expect(enterHint).toBeVisible();
  await expect(grabber).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: /quick capture/i })).toHaveCount(0);

  // Below md: BottomSheet with a grabber and no keyboard hint.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.keyboard.press("Control+j");
  await expect(page.getByRole("dialog", { name: /quick capture/i })).toBeVisible();
  await expect(grabber).toBeVisible();
  await expect(page.getByText("Jot a note… @ to tag")).toBeVisible();
  await expect(enterHint).toHaveCount(0);

  expect(errors).toEqual([]);
});
