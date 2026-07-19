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

  // 2024 background ability spread (#1130): Soldier draws from Str/Dex/Con and
  // grants the Savage Attacker Origin feat. Assign +2 Strength / +1 Dexterity.
  await expect(page.getByText("Origin feat: Savage Attacker")).toBeVisible();
  await page.getByLabel(/\+2 to/).selectOption({ label: "Strength" });
  await page.getByLabel(/\+1 to/).selectOption({ label: "Dexterity" });

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
  // The granted Origin feat rides the Advancements card as a slot-exempt entry.
  await expect(page.getByText("Savage Attacker").first()).toBeVisible();

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

  // 2024 background ability spread (#1130): Sage draws from Con/Int/Wis — assign
  // it so Save unblocks (a specced background gates the form until it's complete).
  await page.getByLabel(/\+2 to/).selectOption({ label: "Intelligence" });
  await page.getByLabel(/\+1 to/).selectOption({ label: "Constitution" });

  // The Spells section appears for a level-1 caster: 2 cantrips + 2 spells.
  await expect(page.getByRole("heading", { name: "Spells" })).toBeVisible();
  await page.getByRole("checkbox", { name: /Eldritch Blast/ }).check();
  await page.getByRole("checkbox", { name: /Poison Spray/ }).check();
  await page.getByRole("checkbox", { name: /Charm Person/ }).check();
  // Hideous Laughter is warlock-legal under SRD 5.2; Dissonant Whispers is now
  // bard-only (#1132) and no longer offered in the warlock picker.
  await page.getByRole("checkbox", { name: /Hideous Laughter/ }).check();

  // Equipment: the deterministic starting-gold path (as above).
  await page.getByRole("button", { name: /Starting gold/ }).click();
  await page.getByRole("button", { name: /^Roll.*×/ }).click();

  await page.getByRole("button", { name: /Save Character/ }).click();
  await expect(page).toHaveURL(/\/characters\/[0-9a-f-]+$/);

  await page.getByRole("tab", { name: "Magic" }).click();
  await expect(page.getByText("Eldritch Blast").first()).toBeVisible();

  expect(errors).toEqual([]);
});
