import { expect, test } from "@playwright/test";

import { login } from "./helpers/auth";
import { collectConsoleErrors } from "./helpers/console";

test("Quick capture: margin dock at md+, chat surface on mobile", async ({ page }) => {
  await login(page);
  const errors = collectConsoleErrors(page);
  await page.getByRole("link", { name: /Smoke Fighter/ }).click();
  await expect(page.getByRole("heading", { name: /Smoke Fighter/, level: 1 })).toBeVisible();

  const grabber = page.locator('button[aria-label="Close"]');
  const enterHint = page.getByText(/↵ save · shift\+↵ new line/);

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

  await page.setViewportSize({ width: 390, height: 844 });
  await page.keyboard.press("Control+j");
  const mobileSurface = page.getByRole("dialog", { name: /quick capture/i });
  await expect(mobileSurface).toBeVisible();
  await expect(mobileSurface).toHaveAttribute("aria-modal", "true");
  await expect(page.getByRole("textbox", { name: /quick note/i })).toBeFocused();
  await expect(page.getByRole("button", { name: /^done$/i })).toBeVisible();
  await expect(page.getByText("Jot a note… @ to tag")).toBeVisible();
  await expect(enterHint).toHaveCount(0);
  await expect(grabber).toHaveCount(0);
  await page.getByRole("button", { name: /^done$/i }).click();
  await expect(page.getByRole("dialog", { name: /quick capture/i })).toHaveCount(0);

  expect(errors).toEqual([]);
});
