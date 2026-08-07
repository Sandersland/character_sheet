import { expect, test, type Page } from "@playwright/test";

import { login } from "./helpers/auth";
import { collectConsoleErrors } from "./helpers/console";
import { passEntryGate } from "./helpers/creation";
import { createCampaign, uniqueName } from "./helpers/api";

// The creation ceremony (#1176) walks one step at a time behind a Continue gate;
// the footer flips to "Create Character" on the Review step.
function continueStep(page: Page) {
  return page.getByRole("button", { name: /Continue/ }).click();
}

// 2024 Human's own two SpeciesTrait choices (#1690): Skillful (one skill of
// your choice) and Versatile (one Origin feat of your choice) — both render
// on the Skills & Tools step and both gate Continue, so every 2024 Human spec
// below must satisfy them. `skill` is chosen per test to be OUTSIDE that
// test's class skillChoices AND the background's own fixed grant, so the
// checkbox is unambiguous on the page (no same-named checkbox in the Skill
// Proficiencies panel above it); `feat` likewise avoids the background's own
// Origin feat (visible on the Abilities step) so the two choices are provably
// independent, never a same-feat collision the backend would 400 on anyway.
async function chooseHumanSpeciesTraits(page: Page, skill: string, feat: string) {
  await page.getByRole("checkbox", { name: skill }).check();
  await page.locator("li").filter({ hasText: feat }).getByRole("button", { name: "Select" }).click();
}

// Equipment step, default (2024) edition: PHB'24's packages have no
// roll-for-gold rule at all (#1535), so "Starting gold" isn't offered — pick
// the lettered option (A), a single deterministic choice with no open picks
// for either class this spec creates (Fighter, Warlock).
//
// Checks EVERY (A) rather than one: since #1565 the step renders a second
// package for the character's background, both cards carry an (A), and
// Continue stays disabled until every package has a selection. Iterating the
// matches keeps this correct for a background with no package (every 2014
// background but Acolyte and Folk Hero) without the spec having to know which
// case it is in.
async function chooseEquipmentOptionA(page: Page) {
  const options = page.getByRole("radio", { name: /^\(A\)/ });
  await expect(options.first()).toBeVisible();
  for (let i = 0; i < (await options.count()); i++) {
    await options.nth(i).check();
  }
  // Then fill every open pick the chosen options revealed, or Continue stays
  // disabled: the 2024 Soldier background's option (A) carries "Gaming Set
  // (same as above)", a boundToToolChoice pick over the character's own tool
  // proficiencies (#1564/#1565). Taking the first real option exercises that
  // binding rather than routing around it via the flat-gold alternative.
  const picks = page.locator("select");
  for (let i = 0; i < (await picks.count()); i++) {
    const pick = picks.nth(i);
    const values = await pick
      .locator("option")
      .evaluateAll((opts) => opts.map((o) => (o as HTMLOptionElement).value).filter(Boolean));
    if (values.length > 0) await pick.selectOption(values[0]);
  }
}

// Walks the guided creation ceremony end-to-end and lands on the new sheet.
test("creation: guided ceremony lands on the sheet with the chosen class", async ({ page }) => {
  const name = uniqueName("Forged Hero");

  await login(page);
  const errors = collectConsoleErrors(page);
  // Navigate via the SPA link (a fresh full-page load to /characters/new races
  // the auth boot and can land on the sign-in page).
  await page.getByRole("link", { name: "New Character" }).first().click();
  await expect(page).toHaveURL(/\/characters\/new$/);
  await passEntryGate(page);

  // Identity step. Labels carry a trailing "*" required marker, so anchor at the
  // start; ^Class also keeps it from matching the Subclass field.
  await page.getByLabel(/^Name/).fill(name);
  await page.getByLabel(/^Alignment/).selectOption({ label: "True Neutral" });
  await page.getByLabel(/^Species/).selectOption({ label: "Human" });
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

  // Skills & Tools step — the 2024 Human's own Skillful (one skill) and
  // Versatile (one Origin feat) picks gate Continue (#1690); Stealth is
  // outside Fighter's skillChoices, and Tough is a different Origin feat
  // from Soldier's own Savage Attacker grant above. #1779: Soldier's Gaming
  // Set is now a background CHOICE (not a fixed grant), so it gates Continue
  // here too — pick Dice Set, which chooseEquipmentOptionA's bound pick below
  // must then offer back on the Equipment step.
  await chooseHumanSpeciesTraits(page, "Stealth", "Tough");
  await page.getByRole("checkbox", { name: "Dice Set" }).check();
  await continueStep(page);

  // Equipment step — the 2024 Fighter package's option (A) (chain mail etc.),
  // no open picks required.
  await chooseEquipmentOptionA(page);
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

// #1570/#1779: Noble's PHB'24 option (A) carries "Gaming Set (same as above)" —
// a boundToToolChoice pick over the gaming-set proficiency the character's own
// Skills & Tools step picks (#1779: Noble grants a CHOICE of gaming set, not a
// fixed one — see BACKGROUNDS' Noble row, catalog-data.ts). Before #1779 this
// covered a DIFFERENT shape that shipped broken in #1565 (the picker filtered
// on chosen tools only, so a background GRANT's dropdown was empty and
// Continue stayed disabled forever); #1779 moved Soldier/Noble off that grant
// entirely, but the bound-pick mechanism this spec exercises is the same one,
// and no unit test catches it: the draft is React-controlled, so only the
// rendered step is wrong.
//
// Landing on the sheet IS the assertion — it can only happen if the Equipment
// step was completable, which requires the bound pick to have offered the
// SAME gaming set chosen on the Skills & Tools step.
test("creation: a Noble's CHOSEN gaming set is offered back by the bound equipment pick", async ({ page }) => {
  const name = uniqueName("Highborn");

  await login(page);
  const errors = collectConsoleErrors(page);
  await page.getByRole("link", { name: "New Character" }).first().click();
  await expect(page).toHaveURL(/\/characters\/new$/);
  await passEntryGate(page);

  await page.getByLabel(/^Name/).fill(name);
  await page.getByLabel(/^Alignment/).selectOption({ label: "True Neutral" });
  await page.getByLabel(/^Species/).selectOption({ label: "Human" });
  await page.getByLabel(/^Class/).selectOption({ label: "Rogue" });
  await page.getByLabel("Background").selectOption({ label: "Noble" });
  await continueStep(page);

  // Noble's PHB'24 spread draws from Str/Int/Cha.
  await page.getByRole("radio", { name: "+2 to Charisma" }).check();
  await page.getByRole("radio", { name: "+1 to Intelligence" }).check();
  await continueStep(page);

  // Skills & Tools step — the 2024 Human's own Skillful/Versatile picks gate
  // Continue (#1690); Survival is outside Rogue's skillChoices, and Tough is
  // a different Origin feat from Noble's own Skilled grant. #1779: Noble's
  // Gaming Set is a background CHOICE — pick Playing Card Set (deliberately
  // NOT Dice Set, so this spec can't pass by accident if the bound pick below
  // silently fell back to a hardcoded name instead of the real selection).
  await chooseHumanSpeciesTraits(page, "Survival", "Tough");
  await page.getByRole("checkbox", { name: "Playing Card Set" }).check();
  await continueStep(page);

  // Equipment step — two cards now (Rogue's package and Noble's own), and the
  // background card's bound pick must offer the CHOSEN Playing Card Set.
  await chooseEquipmentOptionA(page);
  await continueStep(page);

  await page.getByRole("button", { name: /Create Character/ }).click();
  await expect(page).toHaveURL(/\/characters\/[0-9a-f-]+$/);
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();

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
  await passEntryGate(page);

  // Identity step.
  await page.getByLabel(/^Name/).fill(name);
  await page.getByLabel(/^Alignment/).selectOption({ label: "True Neutral" });
  await page.getByLabel(/^Species/).selectOption({ label: "Human" });
  await page.getByLabel(/^Class/).selectOption({ label: "Warlock" });
  // #1325: a 2024 Warlock's subclass gate is level 3, so creation must offer NO
  // picker. Asserting the disabled panel (not just "no combobox") also fails if
  // the field vanishes entirely, which would hide a broken payload.
  await expect(page.getByText("Chosen at level 3")).toBeVisible();
  await expect(page.getByLabel("Subclass")).toHaveCount(0);
  await page.getByLabel("Background").selectOption({ label: "Sage" });
  await continueStep(page);

  // Abilities step — Sage draws from Con/Int/Wis; assign the spread via radios.
  await page.getByRole("radio", { name: "+2 to Intelligence" }).check();
  await page.getByRole("radio", { name: "+1 to Constitution" }).check();
  await continueStep(page);

  // Skills & Tools step — the 2024 Human's own Skillful/Versatile picks gate
  // Continue (#1690); Perception is outside Warlock's skillChoices, and Tough
  // is a different Origin feat from Sage's own Magic Initiate grant.
  await chooseHumanSpeciesTraits(page, "Perception", "Tough");
  await continueStep(page);

  // Spells step (#1160/#1778): a level-1 warlock picks 2 cantrips + 2 spells
  // through the guided picker, one tab at a time — a quiet row opens the big
  // detail card with the full text, and Learn there or the row pill adds the
  // spell. Cantrips is the default (first) tab; a segment click swaps to Spells.
  await expect(page.getByRole("heading", { name: "Learn your magic" })).toBeVisible();
  await page.getByRole("button", { name: "Open Eldritch Blast" }).click();
  await expect(page.getByText(/hurl a beam of crackling energy/)).toBeVisible();
  await page.getByRole("button", { name: /Learn Eldritch Blast/ }).click();
  await page.getByRole("button", { name: "Add Poison Spray" }).click();
  await page.getByRole("radio", { name: /Spells/ }).click();
  await page.getByRole("button", { name: "Add Charm Person" }).click();
  // Hideous Laughter is warlock-legal under SRD 5.2; Dissonant Whispers is now
  // bard-only (#1132) and no longer offered in the warlock picker.
  await page.getByRole("button", { name: "Add Hideous Laughter" }).click();
  await continueStep(page);

  // Equipment step — the 2024 Warlock package's option (A) (no roll-for-gold
  // rule under PHB'24, #1535; same reasoning as the Fighter test above).
  await chooseEquipmentOptionA(page);
  await continueStep(page);

  // Review step — create.
  await page.getByRole("button", { name: /Create Character/ }).click();
  await expect(page).toHaveURL(/\/characters\/[0-9a-f-]+$/);

  await page.getByRole("tab", { name: "Magic" }).click();
  await expect(page.getByText("Eldritch Blast").first()).toBeVisible();

  expect(errors).toEqual([]);
});

// #1325: the half of this flow that could not exist before — a 2014 Warlock's
// subclass gate is level 1 (PHB'14 p.105, Otherworldly Patron), so creation
// must offer a real picker instead of the 2024 "Chosen at level 3" panel.
// Verified safe against seed data: every Subclass row is edition: null
// (shared), so "The Fiend" resolves under 2014 too, and resolveSubclass
// accepts a subclass id whenever the edition-resolved gate is <= 1 (true here).
//
// Reached via a 2014 campaign (rather than the direct "2014 rules" radio
// #1372 also makes available) to exercise the inheritance path — a player
// joining a 2014 table never sees the picker at all.
test("creation: a 2014 warlock must choose its patron at creation", async ({ page }) => {
  const name = uniqueName("Old Ways Warlock");
  const campaignName = uniqueName("Old Ways Table");

  await login(page);
  await createCampaign(page.request, { name: campaignName, rulesEdition: "EDITION_2014" });
  const errors = collectConsoleErrors(page);
  await page.getByRole("link", { name: "New Character" }).first().click();
  await expect(page).toHaveURL(/\/characters\/new$/);
  await passEntryGate(page, { campaign: campaignName });

  // Identity step.
  await page.getByLabel(/^Name/).fill(name);
  await page.getByLabel(/^Alignment/).selectOption({ label: "True Neutral" });
  await page.getByLabel(/^Species/).selectOption({ label: "Human" });
  await page.getByLabel(/^Class/).selectOption({ label: "Warlock" });
  await expect(page.getByText(/Chosen at level/)).toHaveCount(0);
  await page.getByLabel("Subclass").selectOption({ label: "The Fiend" });
  await page.getByLabel("Background").selectOption({ label: "Sage" });
  await continueStep(page);

  // Abilities step — the PHB'24 background ability spread is not offered
  // under 2014 (#1572, a PHB'24-only mechanic): no +2/+1 radios render for
  // Sage here, unlike the 2024 warlock test above, and Continue is not
  // blocked by it. Assert their absence so a reintroduced spread fails the
  // test rather than passing on a step that simply goes unclicked.
  await expect(page.getByRole("radio", { name: /^\+[12] to / })).toHaveCount(0);
  await continueStep(page);

  // Skills & Tools step.
  await continueStep(page);

  // Spells step — level1SpellPicks is edition-invariant, so a 2014 Warlock
  // still walks it exactly like the 2024 case above, EXCEPT the last pick:
  // #1714 forked Hideous Laughter to its real PHB'14 text (Bard+Wizard only —
  // Warlock's access to it is a 2024 addition, SRD 5.2's own class list
  // widened it, see spells.ts's own "Hideous Laughter is warlock-legal under
  // SRD 5.2" comment on the 2024 test above). Before that fork, this spec
  // passed only because the no-2014-row fallback served the 2024 (warlock-
  // legal) row to a 2014 character too; a real fork now correctly excludes
  // it. Protection from Evil and Good is warlock-legal in BOTH editions.
  await expect(page.getByRole("heading", { name: "Learn your magic" })).toBeVisible();
  await page.getByRole("button", { name: "Open Eldritch Blast" }).click();
  await page.getByRole("button", { name: /Learn Eldritch Blast/ }).click();
  await page.getByRole("button", { name: "Add Poison Spray" }).click();
  await page.getByRole("radio", { name: /Spells/ }).click();
  await page.getByRole("button", { name: "Add Charm Person" }).click();
  await page.getByRole("button", { name: "Add Protection from Evil and Good" }).click();
  await continueStep(page);

  // Equipment step — unlike the 2024 case above, a 2014 Warlock package still
  // has a roll-for-gold rule, so the starting-gold path remains reachable
  // here. The gold roll label carries a ×N multiplier, distinguishing it from
  // "Roll 4d6".
  await page.getByRole("button", { name: /Starting gold/ }).click();
  await page.getByRole("button", { name: /^Roll.*×/ }).click();
  await continueStep(page);

  // Review step — create.
  await page.getByRole("button", { name: /Create Character/ }).click();
  await expect(page).toHaveURL(/\/characters\/[0-9a-f-]+$/);

  await expect(page.getByText("The Fiend").first()).toBeVisible();

  expect(errors).toEqual([]);
});

// #1570: the first UNBOUND tool open pick in the app — every earlier
// toolCategory pick was bound to a proficiency the character already had, so
// its dropdown was populated from the character's own tool choices rather than
// from the Item catalog. Folk Hero's "artisan's tools of your choice" is filled
// from Item rows carrying toolCategory "artisan", and only one of the seventeen
// had an Item row before this change: the pick would have rendered as a
// one-entry dropdown. Choosing Smith's Tools specifically is the assertion —
// picking whatever happened to be first would pass against that broken catalog.
//
// Also the only route by which Folk Hero is reachable at all now: it is tagged
// EDITION_2014, so it appears for a 2014 campaign's character and nowhere else.
test("creation: a 2014 Folk Hero picks artisan's tools from the full catalog", async ({ page }) => {
  const name = uniqueName("Village Champion");
  const campaignName = uniqueName("Old Ways Homestead");

  await login(page);
  await createCampaign(page.request, { name: campaignName, rulesEdition: "EDITION_2014" });
  const errors = collectConsoleErrors(page);
  await page.getByRole("link", { name: "New Character" }).first().click();
  await expect(page).toHaveURL(/\/characters\/new$/);
  await passEntryGate(page, { campaign: campaignName });

  await page.getByLabel(/^Name/).fill(name);
  await page.getByLabel(/^Alignment/).selectOption({ label: "True Neutral" });
  await page.getByLabel(/^Species/).selectOption({ label: "Human" });
  await page.getByLabel(/^Class/).selectOption({ label: "Rogue" });
  await page.getByLabel("Background").selectOption({ label: "Folk Hero" });
  await continueStep(page);

  // Abilities step — Folk Hero predates the PHB'24 spread, so there are no
  // +2/+1 radios to assign and the step passes straight through.
  await continueStep(page);

  // Skills & Tools step.
  await continueStep(page);

  // Equipment step. The class card goes down the 2014 roll-for-gold path so the
  // background card's artisan pick is the only dropdown left on the step.
  await page.getByRole("button", { name: /Starting gold/ }).click();
  await page.getByRole("button", { name: /^Roll.*×/ }).click();

  const artisanPick = page.getByRole("combobox");
  await expect(artisanPick).toHaveCount(1);
  await artisanPick.selectOption({ label: "Smith's Tools" });
  await continueStep(page);

  await page.getByRole("button", { name: /Create Character/ }).click();
  await expect(page).toHaveURL(/\/characters\/[0-9a-f-]+$/);
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();

  expect(errors).toEqual([]);
});

// #1680: the two-step species→variant picker. A variant-bearing species
// (2014 Dwarf: Hill/Mountain) cannot Continue without a variant chosen, and
// the created sheet shows the VARIANT's name (Hill Dwarf), not just the bare
// species — reached via a 2014 campaign like the other 2014 specs above.
test("creation: a 2014 Dwarf must choose a variant (Hill Dwarf) before creation", async ({ page }) => {
  const name = uniqueName("Stonebeard");
  const campaignName = uniqueName("Old Ways Deephold");

  await login(page);
  await createCampaign(page.request, { name: campaignName, rulesEdition: "EDITION_2014" });
  const errors = collectConsoleErrors(page);
  await page.getByRole("link", { name: "New Character" }).first().click();
  await expect(page).toHaveURL(/\/characters\/new$/);
  await passEntryGate(page, { campaign: campaignName });

  await page.getByLabel(/^Name/).fill(name);
  await page.getByLabel(/^Alignment/).selectOption({ label: "True Neutral" });
  await page.getByLabel(/^Species/).selectOption({ label: "Dwarf" });
  await page.getByLabel(/^Class/).selectOption({ label: "Rogue" });
  await page.getByLabel("Background").selectOption({ label: "Sage" });

  // Every OTHER identity field is filled, but Dwarf has variant rows
  // (Hill/Mountain) and none is picked yet — Continue must stay blocked.
  await expect(page.getByRole("button", { name: /Continue/ })).toBeDisabled();

  await page.getByLabel(/^Variant/).selectOption({ label: "Hill Dwarf" });
  await expect(page.getByRole("button", { name: /Continue/ })).toBeEnabled();
  await continueStep(page);

  // Abilities step — no PHB'24 spread under 2014 (#1572); passes straight through.
  await continueStep(page);

  // Skills & Tools step.
  await continueStep(page);

  // Equipment step — 2014 keeps the roll-for-gold path (Sage has no own
  // package under 2014, so this is the only card).
  await page.getByRole("button", { name: /Starting gold/ }).click();
  await page.getByRole("button", { name: /^Roll.*×/ }).click();
  await continueStep(page);

  // Review step — create.
  await page.getByRole("button", { name: /Create Character/ }).click();
  await expect(page).toHaveURL(/\/characters\/[0-9a-f-]+$/);
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();

  // The sheet shows the chosen VARIANT's name (the snapshot), not the bare species.
  await expect(page.getByText("Hill Dwarf").first()).toBeVisible();

  expect(errors).toEqual([]);
});
