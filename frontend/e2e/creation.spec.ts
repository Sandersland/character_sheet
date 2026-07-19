import { expect, test } from "@playwright/test";

import { login } from "./helpers/auth";
import { collectConsoleErrors } from "./helpers/console";
import { uniqueName } from "./helpers/api";

// Walks the guided creation form end-to-end and lands on the new sheet. Uses the
// starting-gold path for the equipment step — a single deterministic choice that
// completes the package regardless of catalog contents.
test("creation: guided flow lands on the sheet with the chosen class", async ({ page }) => {
  const name = uniqueName("Forged Hero");

  await login(page);
  const errors = collectConsoleErrors(page);
  // Navigate via the SPA link (a fresh full-page load to /characters/new races
  // the auth boot and can land on the sign-in page).
  await page.getByRole("link", { name: "New Character" }).first().click();
  await expect(page).toHaveURL(/\/characters\/new$/);

  // Labels carry a trailing "*" required marker, so anchor at the start; ^Class
  // also keeps it from matching the Subclass field.
  await page.getByLabel(/^Name/).fill(name);
  await page.getByLabel(/^Alignment/).selectOption({ label: "True Neutral" });
  await page.getByLabel(/^Race/).selectOption({ label: "Human" });
  await page.getByLabel(/^Class/).selectOption({ label: "Fighter" });
  await page.getByLabel("Background").selectOption({ label: "Soldier" });

  // Equipment: choose the starting-gold option and roll a valid amount. The gold
  // roll label carries a ×N multiplier, distinguishing it from the ability "Roll 4d6".
  await page.getByRole("button", { name: /Starting gold/ }).click();
  await page.getByRole("button", { name: /^Roll.*×/ }).click();

  await page.getByRole("button", { name: /Save Character/ }).click();

  await expect(page).toHaveURL(/\/characters\/[0-9a-f-]+$/);
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
  // The mobile mini-header also carries the class line but is display:none at the
  // desktop test viewport — scope to the visible (banner) copy.
  await expect(page.getByText("Fighter").and(page.locator(":visible")).first()).toBeVisible();

  expect(errors).toEqual([]);
});

// #1131: a level-1 caster picks its cantrips + spells during creation and they
// show up on the Magic tab — the flow that surfaced the missing-Eldritch-Blast bug.
test("creation: a warlock picks cantrips + spells that show on the Magic tab", async ({ page }) => {
  const name = uniqueName("Pactbound");

  await login(page);
  const errors = collectConsoleErrors(page);
  await page.getByRole("link", { name: "New Character" }).first().click();
  await expect(page).toHaveURL(/\/characters\/new$/);

  await page.getByLabel(/^Name/).fill(name);
  await page.getByLabel(/^Alignment/).selectOption({ label: "True Neutral" });
  await page.getByLabel(/^Race/).selectOption({ label: "Human" });
  await page.getByLabel(/^Class/).selectOption({ label: "Warlock" });
  await page.getByLabel("Background").selectOption({ label: "Sage" });

  // The Spells section appears for a level-1 caster: 2 cantrips + 2 spells.
  await expect(page.getByRole("heading", { name: "Spells" })).toBeVisible();
  await page.getByRole("checkbox", { name: /Eldritch Blast/ }).check();
  await page.getByRole("checkbox", { name: /Poison Spray/ }).check();
  await page.getByRole("checkbox", { name: /Charm Person/ }).check();
  await page.getByRole("checkbox", { name: /Dissonant Whispers/ }).check();

  // Equipment: the deterministic starting-gold path (as above).
  await page.getByRole("button", { name: /Starting gold/ }).click();
  await page.getByRole("button", { name: /^Roll.*×/ }).click();

  await page.getByRole("button", { name: /Save Character/ }).click();
  await expect(page).toHaveURL(/\/characters\/[0-9a-f-]+$/);

  await page.getByRole("tab", { name: "Magic" }).click();
  await expect(page.getByText("Eldritch Blast").first()).toBeVisible();

  expect(errors).toEqual([]);
});
