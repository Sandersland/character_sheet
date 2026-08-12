import { expect, test } from "@playwright/test";

import { login } from "./helpers/auth";
import { collectConsoleErrors } from "./helpers/console";
import { enterLiveCombat, findCharacterByName, learnManeuver, restoreResourcePool, startCombatAndTurn } from "./helpers/api";

// #809/#811, rewired onto the shared resolver (epic #1827, #1831/#1832):
// Precision Attack (an attackRoll maneuver) lives behind the Battle Master
// maneuvers disclosure under the ResolutionRail, showing its attack section
// only once a to-hit roll exists on the rail. The Battle Master persona is
// Fighter L5; it doesn't know Precision by default, so we teach it via the API.
test("precision attack: the affordance is under the resolution rail", async ({ page }) => {
  await login(page);
  const id = await findCharacterByName(page.request, "Battle Master");
  await learnManeuver(page.request, id, "Precision Attack");
  await restoreResourcePool(page.request, id, "superiorityDice");

  const errors = collectConsoleErrors(page);
  await page.goto(`/characters/${id}`);
  await expect(page.getByRole("heading", { name: /Battle Master/, level: 1 })).toBeVisible();

  await enterLiveCombat(page);
  await expect(page).toHaveURL(/[?&]tab=combat/);

  await startCombatAndTurn(page);

  // Open the Attack sheet.
  await page.getByRole("button", { name: /Use Action/ }).click();
  await page.getByRole("button", { name: "Attack", exact: true }).click();
  const sheet = page.getByRole("dialog");

  // Before any to-hit roll, opening the maneuvers disclosure shows no Precision
  // affordance (it attaches to a roll on the rail).
  await sheet.getByRole("button", { name: /Battle Master maneuvers/ }).click();
  await expect(sheet.getByText("Add to Attack:")).toHaveCount(0);

  // Roll to hit on the rail → the disclosure hosts the Precision affordance;
  // no damage maneuver section yet (no damage roll).
  await sheet.getByRole("button", { name: "Roll to hit" }).click();
  await expect(sheet.getByText("Add to Attack:")).toBeVisible();
  await expect(sheet.getByText("Add to Damage:")).toHaveCount(0);

  // Spending it doesn't error, and the spend itself registers (the button
  // disables once its die is committed) — the resulting boosted total is
  // covered (as a known gap) below.
  const precisionButton = sheet.getByRole("button", { name: /Precision Attack/ });
  await precisionButton.click();
  await expect(precisionButton).toBeDisabled();

  expect(errors).toEqual([]);
});

// KNOWN GAP (#1844): InlineAttackPicker's own buildManeuverView comment records
// that useResolution has no override seam yet — spending Precision Attack
// writes the boosted total into the tally strip (turnState.setTallyAttackTotal)
// but never reaches the rail's own to-hit display (ResolutionRail's
// AttackResultLine call passes no `overrideTotal`) or the committed
// resolveAction event. The "(+maneuver)" marker this test used to assert
// inside the sheet has nowhere left to render until #1844 adds that seam —
// asserting it here would just pin the current degraded (silently-ignored)
// behavior rather than the intended one.
test.fixme(
  "precision attack: spending boosts the to-hit total shown on the rail and reaches the committed event (#1844)",
  async () => {},
);
