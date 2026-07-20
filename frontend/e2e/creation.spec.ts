import { expect, test, type Page } from "@playwright/test";

import { login } from "./helpers/auth";
import { collectConsoleErrors } from "./helpers/console";
import { uniqueName } from "./helpers/api";

// The creation ceremony (#1176) walks one step at a time behind a Continue gate;
// the footer flips to "Create Character" on the Review step.
function continueStep(page: Page) {
  return page.getByRole("button", { name: /Continue/ }).click();
}

// Walks the guided creation ceremony end-to-end and lands on the new sheet. Uses
// the starting-gold path for the equipment step — a single deterministic choice
// that completes the package regardless of catalog contents.
test("creation: guided ceremony lands on the sheet with the chosen class", async ({ page }) => {
  const name = uniqueName("Forged Hero");

  await login(page);
  const errors = collectConsoleErrors(page);
  // Navigate via the SPA link (a fresh full-page load to /characters/new races
  // the auth boot and can land on the sign-in page).
  await page.getByRole("link", { name: "New Character" }).first().click();
  await expect(page).toHaveURL(/\/characters\/new$/);

  // Identity step. Labels carry a trailing "*" required marker, so anchor at the
  // start; ^Class also keeps it from matching the Subclass field.
  await page.getByLabel(/^Name/).fill(name);
  await page.getByLabel(/^Alignment/).selectOption({ label: "True Neutral" });
  await page.getByLabel(/^Race/).selectOption({ label: "Human" });
  await page.getByLabel(/^Class/).selectOption({ label: "Fighter" });
  await page.getByLabel("Background").selectOption({ label: "Soldier" });
  await continueStep(page);

  // Abilities step (#1161): Soldier draws from Str/Dex/Con and grants the Savage
  // Attacker Origin feat; Fighter's primary abilities carry the recommended
  // diamond. Assign +2 Str / +1 Dex via the bonus-column radios.
  await expect(page.getByText("Origin feat: Savage Attacker")).toBeVisible();
  await expect(page.getByText("◆ Fighter").first()).toBeVisible();
  await page.getByRole("radio", { name: "+2 to Strength" }).check();
  await page.getByRole("radio", { name: "+1 to Dexterity" }).check();
  await continueStep(page);

  // Skills & Tools step — no required picks for this build.
  await continueStep(page);

  // Equipment step — choose the starting-gold option and roll a valid amount. The
  // gold roll label carries a ×N multiplier, distinguishing it from "Roll 4d6".
  await page.getByRole("button", { name: /Starting gold/ }).click();
  await page.getByRole("button", { name: /^Roll.*×/ }).click();
  await continueStep(page);

  // Review step — create.
  await page.getByRole("button", { name: /Create Character/ }).click();

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

  // Identity step.
  await page.getByLabel(/^Name/).fill(name);
  await page.getByLabel(/^Alignment/).selectOption({ label: "True Neutral" });
  await page.getByLabel(/^Race/).selectOption({ label: "Human" });
  await page.getByLabel(/^Class/).selectOption({ label: "Warlock" });
  await page.getByLabel("Background").selectOption({ label: "Sage" });
  await continueStep(page);

  // Abilities step — Sage draws from Con/Int/Wis; assign the spread via radios.
  await page.getByRole("radio", { name: "+2 to Intelligence" }).check();
  await page.getByRole("radio", { name: "+1 to Constitution" }).check();
  await continueStep(page);

  // Skills & Tools step.
  await continueStep(page);

  // Spells step: a level-1 warlock picks 2 cantrips + 2 spells.
  await expect(page.getByRole("heading", { name: "Spells" })).toBeVisible();
  await page.getByRole("checkbox", { name: /Eldritch Blast/ }).check();
  await page.getByRole("checkbox", { name: /Poison Spray/ }).check();
  await page.getByRole("checkbox", { name: /Charm Person/ }).check();
  // Hideous Laughter is warlock-legal under SRD 5.2; Dissonant Whispers is now
  // bard-only (#1132) and no longer offered in the warlock picker.
  await page.getByRole("checkbox", { name: /Hideous Laughter/ }).check();
  await continueStep(page);

  // Equipment step — the deterministic starting-gold path (as above).
  await page.getByRole("button", { name: /Starting gold/ }).click();
  await page.getByRole("button", { name: /^Roll.*×/ }).click();
  await continueStep(page);

  // Review step — create.
  await page.getByRole("button", { name: /Create Character/ }).click();
  await expect(page).toHaveURL(/\/characters\/[0-9a-f-]+$/);

  await page.getByRole("tab", { name: "Magic" }).click();
  await expect(page.getByText("Eldritch Blast").first()).toBeVisible();

  expect(errors).toEqual([]);
});
