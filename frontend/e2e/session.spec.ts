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
