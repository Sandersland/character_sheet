import { expect, test } from "@playwright/test";

import { login } from "./helpers/auth";
import { collectConsoleErrors } from "./helpers/console";

// The Quick-capture palette presents per-breakpoint (#771): the top command
// palette at md+, the slide-up BottomSheet below md. Opened with Cmd/Ctrl+J so
// the flow is viewport-independent (no reliance on a header button that may
// reflow on mobile).
test("Quick capture: top palette at md+, BottomSheet on mobile", async ({ page }) => {
  await login(page);
  // Collect after login so the pre-auth 401s from login()'s initial goto don't count.
  const errors = collectConsoleErrors(page);
  await page.getByRole("link", { name: /Smoke Fighter/ }).click();
  await expect(page.getByRole("heading", { name: "Hit Points" })).toBeVisible();

  const grabber = page.locator('button[aria-label="Close"]');
  const enterHint = page.getByText(/Enter to save · Shift\+Enter/);

  // md+ (the config's 1280×800 default): top palette with the keyboard hint, no
  // mobile grabber handle.
  await page.keyboard.press("Control+j");
  await expect(page.getByRole("textbox", { name: /quick note/i })).toBeFocused();
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
