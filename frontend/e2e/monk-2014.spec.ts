import { expect, test, type APIRequestContext } from "@playwright/test";

import { login } from "./helpers/auth";
import { collectConsoleErrors } from "./helpers/console";
import { enterLiveCombat, findCharacterByName, restoreResourcePool, startCombatAndTurn } from "./helpers/api";

async function kiRemaining(request: APIRequestContext, id: string): Promise<number> {
  const res = await request.get(`/api/characters/${id}`);
  const body = (await res.json()) as { resources?: { pools?: { key: string; remaining: number; total: number }[] } };
  return body.resources?.pools?.find((p) => p.key === "ki")?.remaining ?? 0;
}

async function kiTotal(request: APIRequestContext, id: string): Promise<number> {
  const res = await request.get(`/api/characters/${id}`);
  const body = (await res.json()) as { resources?: { pools?: { key: string; remaining: number; total: number }[] } };
  return body.resources?.pools?.find((p) => p.key === "ki")?.total ?? 0;
}

// A persistent dev DB persona can arrive here with every hit die already
// spent by an earlier local run, permanently disabling RestControls.tsx's
// "Rest" button with no in-UI way to recover.
async function ensureSpendableHitDie(request: APIRequestContext, id: string): Promise<void> {
  const res = await request.get(`/api/characters/${id}`);
  const body = (await res.json()) as { hitDice?: { total: number; spent: number } };
  const hd = body.hitDice;
  if (hd && hd.spent >= hd.total) {
    await request.post(`/api/characters/${id}/hp`, { data: { operations: [{ type: "longRest" }] } });
  }
}

test("2014 monk live play: Flurry, Patient Defense, Step of the Wind, Deflect Missiles' throw-back, and Stunning Strike each spend 1 ki; ki recharges on a short rest", async ({ page }) => {
  await login(page);
  const id = await findCharacterByName(page.request, "2014 Open Hand Monk");
  await restoreResourcePool(page.request, id, "ki");
  await ensureSpendableHitDie(page.request, id);

  const errors = collectConsoleErrors(page);
  await page.getByRole("link", { name: /2014 Open Hand Monk/ }).click();
  await enterLiveCombat(page);
  await expect(page).toHaveURL(/[?&]tab=combat/);

  await startCombatAndTurn(page);
  const kiStart = await kiRemaining(page.request, id);

  await page.getByRole("button", { name: "Use Bonus" }).click();
  await page.getByRole("button", { name: "Flurry of Blows" }).click();
  const flurrySheet = page.getByRole("dialog");
  await expect(flurrySheet.getByText(/2 Unarmed Strikes/)).toBeVisible();
  await flurrySheet.getByRole("button", { name: "Roll to hit" }).click();
  await expect.poll(() => kiRemaining(page.request, id)).toBe(kiStart - 1);
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
  await expect.poll(() => kiRemaining(page.request, id)).toBe(kiStart - 2);
  await expect(attackSheet.getByText(/vs DC \d+ —/)).toBeVisible();
  await attackSheet.getByRole("button", { name: "Close" }).last().click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.getByRole("button", { name: "Use Reaction" }).click();
  await page.getByRole("button", { name: "Deflect Missiles" }).click();
  await expect(page.getByText(/Deflect Missiles — reduce ranged weapon attack damage/)).toBeVisible();
  const throwBack = page.getByRole("button", { name: /Throw Back · spend 1 Ki Points/ });
  await expect(throwBack).toBeVisible();
  await throwBack.click();
  await expect.poll(() => kiRemaining(page.request, id)).toBe(kiStart - 3);
  await expect(page.getByText(/Throw back — a ranged attack with the caught missile/)).toBeVisible();

  await page.getByRole("button", { name: "End turn" }).click();

  await page.getByRole("button", { name: "Start my turn" }).click();
  await page.getByRole("button", { name: "Use Bonus" }).click();
  await page.getByRole("button", { name: "Patient Defense" }).click();
  await expect.poll(() => kiRemaining(page.request, id)).toBe(kiStart - 4);

  await page.getByRole("button", { name: /Use Action/ }).click();
  await page.getByRole("button", { name: "Attack", exact: true }).click();
  const attackSheet2 = page.getByRole("dialog");
  await attackSheet2.getByRole("radio", { name: "Unarmed Strike" }).click();
  await attackSheet2.getByRole("button", { name: "Roll to hit" }).click();
  const stunButton2 = attackSheet2.getByRole("button", { name: "Attempt Stunning Strike (1 focus)" });
  await expect(stunButton2).toBeEnabled();
  await stunButton2.click();
  await expect.poll(() => kiRemaining(page.request, id)).toBe(kiStart - 5);
  await expect(attackSheet2.getByText(/vs DC \d+ —/)).toBeVisible();
  await attackSheet2.getByRole("button", { name: "Close" }).last().click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.getByRole("button", { name: "End turn" }).click();

  await page.getByRole("button", { name: "Start my turn" }).click();
  await page.getByRole("button", { name: "Use Bonus" }).click();
  await page.getByRole("button", { name: "Step of the Wind" }).click();
  await expect.poll(() => kiRemaining(page.request, id)).toBe(kiStart - 6);

  const total = await kiTotal(page.request, id);
  await page.getByRole("button", { name: "Rest", exact: true }).click();
  const restSheet = page.getByRole("dialog");
  await expect(restSheet.getByRole("heading", { name: /rest/i })).toBeVisible();
  await restSheet.getByRole("button", { name: "Rest", exact: true }).click();
  await expect.poll(() => kiRemaining(page.request, id)).toBe(total);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  expect(errors).toEqual([]);
});

test("2014 discipline cast: an upcast Sweeping Cinder Strike spends the requested ki and appears in the session log", async ({ page }) => {
  await login(page);
  const id = await findCharacterByName(page.request, "2014 Elements Monk");
  await restoreResourcePool(page.request, id, "ki");

  const errors = collectConsoleErrors(page);
  await page.getByRole("link", { name: /2014 Elements Monk/ }).click();
  // startCombatAndTurn is required, not just enterLiveCombat: CharacterSheetContent
  // only swaps in CombatLivePanel once a TurnState exists.
  await enterLiveCombat(page);
  await startCombatAndTurn(page);
  await expect(page).toHaveURL(/[?&]tab=combat/);

  await page.getByRole("tab", { name: "Class" }).click();
  await expect(page.getByRole("heading", { name: "Elemental Disciplines" })).toBeVisible();

  const row = page.getByRole("listitem").filter({ hasText: "Sweeping Cinder Strike" });
  await expect(row).toBeVisible();

  // 3 is this persona's per-cast cap at monk L6 (maxKiPerDiscipline, disciplines.ts).
  await row.getByLabel("Ki to spend on Sweeping Cinder Strike").selectOption("3");

  const kiBefore = await kiRemaining(page.request, id);
  await row.getByRole("button", { name: "Cast" }).click();
  await expect.poll(() => kiRemaining(page.request, id)).toBe(kiBefore - 3);

  await page.getByRole("tab", { name: /^Combat/ }).click();
  await page.getByRole("button", { name: "Open session log" }).click();
  await expect(page.getByText(/Cast Sweeping Cinder Strike \(Spent 3 Ki Points/).last()).toBeVisible();

  expect(errors).toEqual([]);
});

test("2014 shadow monk: Shadow Step is offered as a bonus action with its reminder text", async ({ page }) => {
  await login(page);

  const errors = collectConsoleErrors(page);
  await page.getByRole("link", { name: /2014 Monk of Shadow/ }).click();
  await enterLiveCombat(page);
  await expect(page).toHaveURL(/[?&]tab=combat/);

  await startCombatAndTurn(page);

  await expect(page.getByRole("button", { name: "Use Bonus" })).toBeVisible();
  await page.getByRole("button", { name: "Use Bonus" }).click();
  const shadowStep = page.getByRole("button", { name: "Shadow Step" });
  await expect(shadowStep).toBeVisible();
  await expect(shadowStep.getByText(/teleport as a bonus action up to 60 ft/i)).toBeVisible();

  await shadowStep.click();
  await expect(page.getByRole("button", { name: "Use Bonus" })).toHaveCount(0);
  await expect(page.getByText(/teleport as a bonus action up to 60 ft/i)).toBeVisible();

  expect(errors).toEqual([]);
});
