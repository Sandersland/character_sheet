import { expect, test, type Page } from "@playwright/test";

import { login } from "./helpers/auth";
import { collectConsoleErrors } from "./helpers/console";
import { createCharacter, gotoSheet, uniqueName } from "./helpers/api";

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
  // XP + level-up live on Overview; spell slots derive onto the Magic tab.
  await gotoSheet(page, id, "overview");

  // Before: level 4, +2 proficiency (Proficiency is a persistent banner chip).
  await expect(page.getByText("Level 4").first()).toBeVisible();
  await expect(proficiencyValue(page)).toHaveText("+2");
  // No 3rd-level slots yet — checked on the Magic tab, where the slot meters live.
  await page.getByRole("tab", { name: "Magic" }).click();
  await expect(page.getByRole("meter", { name: "Level 3 slots remaining" })).toHaveCount(0);

  // Back to Overview to award enough XP to cross into level 5.
  await page.getByRole("tab", { name: "Overview" }).click();
  await page.getByLabel("XP to award").fill(String(XP_TO_L5));
  await page.getByRole("button", { name: "Award XP" }).click();

  // After: level 5, +3 proficiency.
  await expect(page.getByText("Level 5").first()).toBeVisible();
  await expect(proficiencyValue(page)).toHaveText("+3");
  // 3rd-level slots now derived — visible on the Magic tab.
  await page.getByRole("tab", { name: "Magic" }).click();
  await expect(page.getByRole("meter", { name: "Level 3 slots remaining" })).toBeVisible();

  expect(errors).toEqual([]);
});
