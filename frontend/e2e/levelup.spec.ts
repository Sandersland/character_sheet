import { expect, test, type Page } from "@playwright/test";

import { login } from "./helpers/auth";
import { collectConsoleErrors } from "./helpers/console";
import { createCharacter, gotoSheet, uniqueName } from "./helpers/api";

const WIZARD_L4_XP = 2700;
const XP_TO_L5 = 3800;

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
  await gotoSheet(page, id, "overview");

  await expect(page.getByText("Level 4").first()).toBeVisible();
  await expect(proficiencyValue(page)).toHaveText("+2");
  await page.getByRole("tab", { name: "Magic" }).click();
  await expect(page.getByTitle("Expend a level 3 slot")).toHaveCount(0);

  await page.getByRole("tab", { name: "Overview" }).click();
  await page.getByLabel("XP to award").fill(String(XP_TO_L5));
  await page.getByRole("button", { name: "Award XP" }).click();

  await expect(page.getByText("Level 5").first()).toBeVisible();
  await expect(proficiencyValue(page)).toHaveText("+3");
  await page.getByRole("tab", { name: "Magic" }).click();
  await expect(page.getByTitle("Expend a level 3 slot").first()).toBeVisible();

  expect(errors).toEqual([]);
});
