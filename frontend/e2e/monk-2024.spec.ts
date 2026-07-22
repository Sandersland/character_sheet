import { expect, test, type APIRequestContext } from "@playwright/test";

import { login } from "./helpers/auth";
import { collectConsoleErrors } from "./helpers/console";
import { enterLiveCombat, findCharacterByName, restoreResourcePool } from "./helpers/api";

// The Open Hand Monk L11 persona (seeded in global-setup, #1249/#1250) is
// Monk L11 / Warrior of the Open Hand — Heightened Focus (L10) upgrades
// Flurry to 3 strikes; Deflect Attacks (L3) and Stunning Strike (L5) are both
// live. One live-play walk exercises all four Focus-adjacent 2024 verticals:
// Flurry of Blows and an Unarmed Strike + Stunning Strike share turn 1's
// bonus/action pair; Deflect Attacks fires between turns (a reaction is
// available off-turn); Patient Defense (Focus) needs turn 2's own bonus
// action since Flurry already spent turn 1's.
async function focusRemaining(request: APIRequestContext, id: string): Promise<number> {
  const res = await request.get(`/api/characters/${id}`);
  const body = (await res.json()) as { resources?: { pools?: { key: string; remaining: number }[] } };
  return body.resources?.pools?.find((p) => p.key === "focus")?.remaining ?? 0;
}

test("2024 monk live play: Flurry, Stunning Strike, Deflect Attacks redirect, and Patient Defense each spend 1 Focus", async ({ page }) => {
  await login(page);
  const id = await findCharacterByName(page.request, "Open Hand Monk L11");
  await restoreResourcePool(page.request, id, "focus");

  const errors = collectConsoleErrors(page);
  await page.getByRole("link", { name: /Open Hand Monk L11/ }).click();
  await enterLiveCombat(page);
  await expect(page).toHaveURL(/[?&]tab=combat/);

  await page.getByRole("button", { name: /Start combat/i }).click();
  await page.getByRole("button", { name: "Start my turn" }).click();

  const focusStart = await focusRemaining(page.request, id);

  // ── Flurry of Blows (bonus action): 1 strike commits the shared 1-Focus
  // spend once, not per strike (Heightened Focus makes this a 3-strike flurry).
  await page.getByRole("button", { name: "Use Bonus" }).click();
  await page.getByRole("button", { name: "Flurry of Blows" }).click();
  const flurrySheet = page.getByRole("dialog");
  await expect(flurrySheet.getByText(/3 Unarmed Strikes/)).toBeVisible();
  await flurrySheet.getByRole("button", { name: "Roll to hit" }).click();
  await expect.poll(() => focusRemaining(page.request, id)).toBe(focusStart - 1);
  await expect(page.locator('[data-testid="roll-result-seal"]')).toBeVisible();
  await flurrySheet.getByRole("button", { name: "Close" }).last().click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // ── Attack action + Stunning Strike: an Unarmed Strike hit unlocks the
  // once-per-turn 1-Focus attempt (server rolls the target's Con save).
  await page.getByRole("button", { name: /Use Action/ }).click();
  await page.getByRole("button", { name: "Attack", exact: true }).click();
  const attackSheet = page.getByRole("dialog");
  await attackSheet.getByRole("radio", { name: "Unarmed Strike" }).click();
  await attackSheet.getByRole("button", { name: "Roll to hit" }).click();
  const stunButton = attackSheet.getByRole("button", { name: "Attempt Stunning Strike (1 focus)" });
  await expect(stunButton).toBeEnabled();
  await stunButton.click();
  await expect.poll(() => focusRemaining(page.request, id)).toBe(focusStart - 2);
  await expect(attackSheet.getByText(/vs DC \d+ —/)).toBeVisible();
  await attackSheet.getByRole("button", { name: "Close" }).last().click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.getByRole("button", { name: "End turn" }).click();

  // ── Deflect Attacks (reaction, available between turns): the base
  // reduction is a free client roll; Redirect spends 1 Focus.
  await page.getByRole("button", { name: "Use Reaction" }).click();
  await page.getByRole("button", { name: "Deflect Attacks" }).click();
  await expect(page.getByText(/Deflect Attacks — reduce/)).toBeVisible();
  const redirect = page.getByRole("button", { name: /Redirect · spend 1 Focus/ });
  await expect(redirect).toBeVisible();
  await redirect.click();
  await expect.poll(() => focusRemaining(page.request, id)).toBe(focusStart - 3);
  await expect(page.getByText(/Redirect — a creature within 60 ft/)).toBeVisible();

  // ── Turn 2's own bonus action: Patient Defense (1 Focus).
  await page.getByRole("button", { name: "Start my turn" }).click();
  await page.getByRole("button", { name: "Use Bonus" }).click();
  await page.getByRole("button", { name: "Patient Defense (1 Focus)" }).click();
  await expect.poll(() => focusRemaining(page.request, id)).toBe(focusStart - 4);
  await expect(page.getByText(/Disengage \+ Dodge/)).toBeVisible();

  expect(errors).toEqual([]);
});
