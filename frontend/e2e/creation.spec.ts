import { expect, test, type Page } from "@playwright/test";

import { login } from "./helpers/auth";
import { collectConsoleErrors } from "./helpers/console";
import { passEntryGate } from "./helpers/creation";
import { createCampaign, uniqueName } from "./helpers/api";

function continueStep(page: Page) {
  return page.getByRole("button", { name: /Continue/ }).click();
}

async function chooseHumanSpeciesTraits(page: Page, skill: string, feat: string) {
  await page.getByRole("checkbox", { name: skill }).check();
  await page.locator("li").filter({ hasText: feat }).getByRole("button", { name: "Select" }).click();
}

// #1565: class AND background each render an (A) radio; both must be selected or Continue stays disabled.
async function chooseEquipmentOptionA(page: Page) {
  const options = page.getByRole("radio", { name: /^\(A\)/ });
  await expect(options.first()).toBeVisible();
  for (let i = 0; i < (await options.count()); i++) {
    await options.nth(i).check();
  }
  const picks = page.locator("select");
  for (let i = 0; i < (await picks.count()); i++) {
    const pick = picks.nth(i);
    const values = await pick
      .locator("option")
      .evaluateAll((opts) => opts.map((o) => (o as HTMLOptionElement).value).filter(Boolean));
    if (values.length > 0) await pick.selectOption(values[0]);
  }
}

test("creation: guided ceremony lands on the sheet with the chosen class", async ({ page }) => {
  const name = uniqueName("Forged Hero");

  await login(page);
  const errors = collectConsoleErrors(page);
  await page.getByRole("link", { name: "New Character" }).first().click();
  await expect(page).toHaveURL(/\/characters\/new$/);
  await passEntryGate(page);

  await page.getByLabel(/^Name/).fill(name);
  await page.getByLabel(/^Alignment/).selectOption({ label: "True Neutral" });
  await page.getByLabel(/^Species/).selectOption({ label: "Human" });
  await page.getByLabel(/^Class/).selectOption({ label: "Fighter" });
  await page.getByLabel("Background").selectOption({ label: "Soldier" });
  await continueStep(page);

  await expect(page.getByText("Origin feat: Savage Attacker")).toBeVisible();
  await expect(page.getByText("◆ Fighter").first()).toBeVisible();
  await page.getByRole("radio", { name: "+2 to Strength" }).check();
  await page.getByRole("radio", { name: "+1 to Dexterity" }).check();
  await continueStep(page);

  await chooseHumanSpeciesTraits(page, "Stealth", "Tough");
  await page.getByRole("checkbox", { name: "Dice Set" }).check();
  await continueStep(page);

  await chooseEquipmentOptionA(page);
  await continueStep(page);

  await page.getByRole("button", { name: /Create Character/ }).click();

  await expect(page).toHaveURL(/\/characters\/[0-9a-f-]+$/);
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
  await expect(page.getByText("Fighter").and(page.locator(":visible")).first()).toBeVisible();
  await expect(page.getByText("Savage Attacker").first()).toBeVisible();

  expect(errors).toEqual([]);
});

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

  await page.getByRole("radio", { name: "+2 to Charisma" }).check();
  await page.getByRole("radio", { name: "+1 to Intelligence" }).check();
  await continueStep(page);

  await chooseHumanSpeciesTraits(page, "Survival", "Tough");
  await page.getByRole("checkbox", { name: "Playing Card Set" }).check();
  await continueStep(page);

  await chooseEquipmentOptionA(page);
  await continueStep(page);

  await page.getByRole("button", { name: /Create Character/ }).click();
  await expect(page).toHaveURL(/\/characters\/[0-9a-f-]+$/);
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();

  expect(errors).toEqual([]);
});

test("creation: a warlock picks cantrips + spells that show on the Magic tab", async ({ page }) => {
  const name = uniqueName("Pactbound");

  await login(page);
  const errors = collectConsoleErrors(page);
  await page.getByRole("link", { name: "New Character" }).first().click();
  await expect(page).toHaveURL(/\/characters\/new$/);
  await passEntryGate(page);

  await page.getByLabel(/^Name/).fill(name);
  await page.getByLabel(/^Alignment/).selectOption({ label: "True Neutral" });
  await page.getByLabel(/^Species/).selectOption({ label: "Human" });
  await page.getByLabel(/^Class/).selectOption({ label: "Warlock" });
  await expect(page.getByText("Chosen at level 3")).toBeVisible();
  await expect(page.getByLabel("Subclass")).toHaveCount(0);
  await page.getByLabel("Background").selectOption({ label: "Sage" });
  await continueStep(page);

  await page.getByRole("radio", { name: "+2 to Intelligence" }).check();
  await page.getByRole("radio", { name: "+1 to Constitution" }).check();
  await continueStep(page);

  await chooseHumanSpeciesTraits(page, "Perception", "Tough");
  await continueStep(page);

  await expect(page.getByRole("heading", { name: "Learn your magic" })).toBeVisible();
  await page.getByRole("button", { name: "Open Eldritch Blast" }).click();
  await expect(page.getByText(/hurl a beam of crackling energy/)).toBeVisible();
  await page.getByRole("button", { name: /Learn Eldritch Blast/ }).click();
  await page.getByRole("button", { name: "Add Poison Spray" }).click();
  await page.getByRole("radio", { name: /Spells/ }).click();
  await page.getByRole("button", { name: "Add Charm Person" }).click();
  await page.getByRole("button", { name: "Add Hideous Laughter" }).click();
  await continueStep(page);

  await chooseEquipmentOptionA(page);
  await continueStep(page);

  await page.getByRole("button", { name: /Create Character/ }).click();
  await expect(page).toHaveURL(/\/characters\/[0-9a-f-]+$/);

  await page.getByRole("tab", { name: "Magic" }).click();
  await expect(page.getByText("Eldritch Blast").first()).toBeVisible();

  expect(errors).toEqual([]);
});

test("creation: a 2014 warlock must choose its patron at creation", async ({ page }) => {
  const name = uniqueName("Old Ways Warlock");
  const campaignName = uniqueName("Old Ways Table");

  await login(page);
  await createCampaign(page.request, { name: campaignName, rulesEdition: "EDITION_2014" });
  const errors = collectConsoleErrors(page);
  await page.getByRole("link", { name: "New Character" }).first().click();
  await expect(page).toHaveURL(/\/characters\/new$/);
  await passEntryGate(page, { campaign: campaignName });

  await page.getByLabel(/^Name/).fill(name);
  await page.getByLabel(/^Alignment/).selectOption({ label: "True Neutral" });
  await page.getByLabel(/^Species/).selectOption({ label: "Human" });
  await page.getByLabel(/^Class/).selectOption({ label: "Warlock" });
  await expect(page.getByText(/Chosen at level/)).toHaveCount(0);
  await page.getByLabel("Subclass").selectOption({ label: "The Fiend" });
  await page.getByLabel("Background").selectOption({ label: "Sage" });
  await continueStep(page);

  await expect(page.getByRole("radio", { name: /^\+[12] to / })).toHaveCount(0);
  await continueStep(page);

  await continueStep(page);

  await expect(page.getByRole("heading", { name: "Learn your magic" })).toBeVisible();
  await page.getByRole("button", { name: "Open Eldritch Blast" }).click();
  await page.getByRole("button", { name: /Learn Eldritch Blast/ }).click();
  await page.getByRole("button", { name: "Add Poison Spray" }).click();
  await page.getByRole("radio", { name: /Spells/ }).click();
  await page.getByRole("button", { name: "Add Charm Person" }).click();
  // PHB'14: Hideous Laughter is Bard/Wizard only; Protection from Evil and Good is Warlock-legal in both editions.
  await page.getByRole("button", { name: "Add Protection from Evil and Good" }).click();
  await continueStep(page);

  await page.getByRole("button", { name: /Starting gold/ }).click();
  await page.getByRole("button", { name: /^Roll.*×/ }).click();
  await continueStep(page);

  await page.getByRole("button", { name: /Create Character/ }).click();
  await expect(page).toHaveURL(/\/characters\/[0-9a-f-]+$/);

  await expect(page.getByText("The Fiend").first()).toBeVisible();

  expect(errors).toEqual([]);
});

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

  await continueStep(page);

  await continueStep(page);

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

  await expect(page.getByRole("button", { name: /Continue/ })).toBeDisabled();

  await page.getByLabel(/^Variant/).selectOption({ label: "Hill Dwarf" });
  await expect(page.getByRole("button", { name: /Continue/ })).toBeEnabled();
  await continueStep(page);

  await continueStep(page);

  await continueStep(page);

  await page.getByRole("button", { name: /Starting gold/ }).click();
  await page.getByRole("button", { name: /^Roll.*×/ }).click();
  await continueStep(page);

  await page.getByRole("button", { name: /Create Character/ }).click();
  await expect(page).toHaveURL(/\/characters\/[0-9a-f-]+$/);
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();

  await expect(page.getByText("Hill Dwarf").first()).toBeVisible();

  expect(errors).toEqual([]);
});
