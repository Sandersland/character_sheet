import { expect, test, type Page } from "@playwright/test";

import { login } from "./helpers/auth";
import { collectConsoleErrors } from "./helpers/console";
import { createCharacter, uniqueName } from "./helpers/api";

// A fresh Wizard parked one XP threshold below L5 so the award crosses it: L4→L5
// bumps proficiency (+2→+3) and unlocks 3rd-level spell slots — both derived.
const WIZARD_L4_XP = 2700;
const XP_TO_L5 = 3800; // 2700 + 3800 = 6500 (L5 threshold)

function proficiencyValue(page: Page) {
  return page.getByText("Proficiency", { exact: true }).locator("xpath=preceding-sibling::span");
}

test("levelup: awarding XP across a threshold raises level, proficiency, and slots", async ({
  page,
}) => {
  await login(page);
  const id = await createCharacter(page.request, {
    name: uniqueName("Rising Wizard"),
    className: "Wizard",
    experiencePoints: WIZARD_L4_XP,
  });

  const errors = collectConsoleErrors(page);
  await page.goto(`/characters/${id}`);

  // Before: level 4, +2 proficiency, no 3rd-level slots.
  await expect(page.getByText("Level 4").first()).toBeVisible();
  await expect(proficiencyValue(page)).toHaveText("+2");
  await expect(page.getByRole("meter", { name: "Level 3 slots remaining" })).toHaveCount(0);

  // Award enough XP to cross into level 5.
  await page.getByLabel("XP to award").fill(String(XP_TO_L5));
  await page.getByRole("button", { name: "Award XP" }).click();

  // After: level 5, +3 proficiency, 3rd-level slots now derived.
  await expect(page.getByText("Level 5").first()).toBeVisible();
  await expect(proficiencyValue(page)).toHaveText("+3");
  await expect(page.getByRole("meter", { name: "Level 3 slots remaining" })).toBeVisible();

  expect(errors).toEqual([]);
});
