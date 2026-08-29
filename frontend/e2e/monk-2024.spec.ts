import { expect, test, type APIRequestContext } from "@playwright/test";

import { login } from "./helpers/auth";
import { collectConsoleErrors } from "./helpers/console";
import { enterLiveCombat, findCharacterByName, restoreResourcePool, startCombatAndTurn } from "./helpers/api";

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

  await startCombatAndTurn(page);

  const focusStart = await focusRemaining(page.request, id);

  await page.getByRole("button", { name: "Use Bonus" }).click();
  await page.getByRole("button", { name: "Flurry of Blows" }).click();
  const flurrySheet = page.getByRole("dialog");
  await expect(flurrySheet.getByText(/3 Unarmed Strikes/)).toBeVisible();
  await flurrySheet.getByRole("button", { name: "Roll to hit" }).click();
  await expect.poll(() => focusRemaining(page.request, id)).toBe(focusStart - 1);
  await expect(page.locator('[data-testid="roll-result-seal"]')).toBeVisible();
  await flurrySheet.getByRole("button", { name: "Close" }).last().click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

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

  await page.getByRole("button", { name: "Use Reaction" }).click();
  await page.getByRole("button", { name: "Deflect Attacks" }).click();
  await expect(page.getByText(/Deflect Attacks — reduce/)).toBeVisible();
  const redirect = page.getByRole("button", { name: /Redirect · spend 1 Focus Points/ });
  await expect(redirect).toBeVisible();
  await redirect.click();
  await expect.poll(() => focusRemaining(page.request, id)).toBe(focusStart - 3);
  await expect(page.getByText(/Redirect — a creature within 60 ft/)).toBeVisible();

  await page.getByRole("button", { name: "Start my turn" }).click();
  await page.getByRole("button", { name: "Use Bonus" }).click();
  await page.getByRole("button", { name: "Patient Defense (1 Focus)" }).click();
  await expect.poll(() => focusRemaining(page.request, id)).toBe(focusStart - 4);
  await expect(page.getByText(/Disengage \+ Dodge/)).toBeVisible();

  expect(errors).toEqual([]);
});
