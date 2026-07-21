import { expect, test } from "@playwright/test";

import { login } from "./helpers/auth";
import { collectConsoleErrors } from "./helpers/console";
import { createCharacter, uniqueName } from "./helpers/api";

// A fresh Fighter parked at L1 threshold (0 XP) with just enough to cross into
// L2 — the simplest plan (no ASI/subclass at L2), so the ceremony's first and
// only real step is Hit Points.
const XP_TO_L2 = 300;

// #1172: the settled die used to unmount the instant it landed. This drives a
// real roll end-to-end and asserts the 3D die and the settled result text are
// BOTH visible together, well after the ~1.3s tumble — proving the die lingers
// instead of vanishing the moment the roll resolves.
test("levelup: the HP die lingers on its settled face alongside the result", async ({ page }) => {
  await login(page);
  const id = await createCharacter(page.request, {
    name: uniqueName("Rolling Fighter"),
    className: "Fighter",
    // #1170: flat 10s so no other class clears its multiclass prerequisite —
    // the ceremony's class-choice step auto-skips (single option: Fighter
    // itself), landing straight on Hit Points like this spec expects.
    abilityScores: { strength: 10, dexterity: 10, constitution: 14, intelligence: 10, wisdom: 10, charisma: 10 },
  });
  await page.request.post(`/api/characters/${id}/experience`, {
    data: { operations: [{ type: "set", value: XP_TO_L2 }] },
  });

  const errors = collectConsoleErrors(page);
  await page.goto(`/characters/${id}/level-up`);

  await expect(page.getByRole("heading", { name: /roll for hit points/i })).toBeVisible();
  await page.getByRole("button", { name: /^roll 1d/i }).click();

  // Wait for the die to settle, then confirm the result text is up WITH it —
  // the linger invariant, without a hardcoded tumble-length sleep.
  await expect(page.getByRole("status")).toBeVisible({ timeout: 5000 });
  await expect(page.getByText(/new maximum hp/i)).toBeVisible();
  await expect(page.getByRole("status")).toBeVisible();

  expect(errors).toEqual([]);
});
