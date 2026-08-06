import { expect, test, type APIRequestContext } from "@playwright/test";

import { login } from "./helpers/auth";
import { collectConsoleErrors } from "./helpers/console";
import { enterLiveCombat, findCharacterByName, restoreResourcePool, startCombatAndTurn } from "./helpers/api";

// 2014 Monk e2e (#1506, slice 7/7 of epic #1313) — the 2024 suite is four
// files (monk-2024.spec.ts + shadow-arts.spec.ts + shadow-step.spec.ts +
// unarmed.spec.ts); this ONE file covers the 2014 fork instead, split across
// its three dedicated personas (global-setup.ts):
//   "2014 Open Hand Monk"  — base Monk kit: Flurry of Blows, Patient Defense,
//                            Step of the Wind (each a flat 1-ki spend, no
//                            2024 free/paid pair), Deflect Missiles + its
//                            1-ki throw-back, and Stunning Strike landing on
//                            two separate turns (the once-per-turn gate
//                            resetting at Start Turn — a literal same-turn
//                            second attempt is blocked by the UI itself, the
//                            "Already used this turn" disabled state).
//   "2014 Elements Monk"   — Way of the Four Elements: an upcast Elemental
//                            Discipline cast, read back off the session log.
//   "2014 Monk of Shadow"  — Way of Shadow: only Shadow Step is exercised.
//                            shadowArts/cloakOfShadows/opportunist reuse the
//                            SAME action keys as their 2024 Warrior-of-Shadow
//                            counterparts (actions.ts), but the 2014 4-spell-
//                            menu Shadow Arts shape and the 2014 zero-cost
//                            Cloak of Shadows have no frontend UI yet — only
//                            2024's shapes are wired (ShadowArtsSection.tsx's
//                            own header comment: "the 2014 4-spell menu is
//                            retired"; classFeatures.ts's has2024ShadowAction
//                            gate; both action keys carry no ACTION_RESOLVERS
//                            entry and no served resolverKind, so
//                            resolverFor returns undefined for them). Shadow
//                            Step is the one exception: it reuses the SAME
//                            "shadowStep" resolver entry for both editions
//                            (no edition branch at all), so it renders today.

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

// Guarantee at least 1 spendable hit die before the short-rest UI check below.
// A shared, persistent dev DB persona (unlike a per-run fresh CI seed) can
// arrive here with every hit die already spent by an EARLIER local run of
// this same spec, permanently disabling the "Rest" button (RestControls.tsx:
// `disabled={... || availableDice === 0}`) with no in-UI way to recover. A
// long rest restores up to HALF the total (min 1, the 5e rule) — always
// enough for this test's single short-rest spend.
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

  // ── Turn 1, bonus action: Flurry of Blows — 2014's flat 2-strike shape
  // (no Heightened Focus 3-strike upgrade, 2024-only), 1 ki.
  await page.getByRole("button", { name: "Use Bonus" }).click();
  await page.getByRole("button", { name: "Flurry of Blows" }).click();
  const flurrySheet = page.getByRole("dialog");
  await expect(flurrySheet.getByText(/2 Unarmed Strikes/)).toBeVisible();
  await flurrySheet.getByRole("button", { name: "Roll to hit" }).click();
  await expect.poll(() => kiRemaining(page.request, id)).toBe(kiStart - 1);
  await flurrySheet.getByRole("button", { name: "Close" }).last().click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // ── Turn 1, action: Attack + Unarmed Strike hit + Stunning Strike (1st landing).
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

  // ── Between turns: Deflect Missiles (reaction, base reduction is free)
  // then the 1-ki throw-back.
  await page.getByRole("button", { name: "Use Reaction" }).click();
  await page.getByRole("button", { name: "Deflect Missiles" }).click();
  await expect(page.getByText(/Deflect Missiles — reduce ranged weapon attack damage/)).toBeVisible();
  const throwBack = page.getByRole("button", { name: /Throw back · spend 1 ki/ });
  await expect(throwBack).toBeVisible();
  await throwBack.click();
  await expect.poll(() => kiRemaining(page.request, id)).toBe(kiStart - 3);
  await expect(page.getByText(/Throw back — a ranged attack with the caught missile/)).toBeVisible();

  await page.getByRole("button", { name: "End turn" }).click();

  // ── Turn 2, bonus action: Patient Defense — 2014's ONE flat-1-ki row (no
  // free variant, unlike 2024's competing free/paid pair).
  await page.getByRole("button", { name: "Start my turn" }).click();
  await page.getByRole("button", { name: "Use Bonus" }).click();
  await page.getByRole("button", { name: "Patient Defense" }).click();
  await expect.poll(() => kiRemaining(page.request, id)).toBe(kiStart - 4);

  // ── Turn 2, action: Attack + Stunning Strike lands a SECOND time — the
  // once-per-turn gate reset at Start Turn (a literal same-turn second
  // attempt is blocked by the UI's own "Already used this turn" disabled
  // state, so two turns is how "twice" is actually exercised).
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

  // ── Turn 3, bonus action: Step of the Wind — 2014's ONE flat-1-ki row.
  await page.getByRole("button", { name: "Start my turn" }).click();
  await page.getByRole("button", { name: "Use Bonus" }).click();
  await page.getByRole("button", { name: "Step of the Wind" }).click();
  await expect.poll(() => kiRemaining(page.request, id)).toBe(kiStart - 6);

  // ── Ki recharges on a short rest (recharge: "short-or-long", monk.ts).
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
  // Combat must be STARTED, not just joined: CharacterSheetContent only swaps
  // in CombatLivePanel once a TurnState exists (Start Combat) — a joined-but-
  // idle session shows the static idle CombatPanel instead. Either way the log
  // is never shown inline (#1086, CombatLivePanel's own docblock: "no
  // persistent log card") — it opens on demand in a Drawer/BottomSheet, below.
  // The cast itself gets a real sessionId either way (getActiveSessionId,
  // character-transaction.ts, resolved server-side regardless of which tab
  // issues it); this is only about which panel the log affordance lives on.
  await enterLiveCombat(page);
  await startCombatAndTurn(page);
  await expect(page).toHaveURL(/[?&]tab=combat/);

  await page.getByRole("tab", { name: "Class" }).click();
  await expect(page.getByRole("heading", { name: "Elemental Disciplines" })).toBeVisible();

  const row = page.getByRole("listitem").filter({ hasText: "Sweeping Cinder Strike" });
  await expect(row).toBeVisible();

  // Upcast: the picker defaults to the base 2 ki; select 3 (the persona's
  // per-cast cap at monk L6 — maxKiPerDiscipline(6) = min(6, 2 + floor(5/4)) = 3).
  await row.getByLabel("Ki to spend on Sweeping Cinder Strike").selectOption("3");

  const kiBefore = await kiRemaining(page.request, id);
  await row.getByRole("button", { name: "Cast" }).click();
  await expect.poll(() => kiRemaining(page.request, id)).toBe(kiBefore - 3);

  // Read the cast back off the session log (#1506's own AC) — castDiscipline
  // has no dedicated SessionLog row builder (sessionLogFeed.ts), so it renders
  // via the generic summary fallback: the server's own `outcome.summary`
  // verbatim, e.g. "Cast Sweeping Cinder Strike (Spent 3 Ki Points — 3/6
  // remaining): 9 fire damage" (buildCastSummary, ability-cast.ts — the
  // pool-spend's own summary IS the cost label, not a bare "3 ki"). Back on
  // Combat, "Open session log" mounts SessionLog for the first time this test
  // — a fresh mount always re-fetches (its own docblock), so this reads
  // current data regardless of any refreshKey bump.
  await page.getByRole("tab", { name: /^Combat/ }).click();
  await page.getByRole("button", { name: "Open session log" }).click();
  // `.last()` (chat convention: newest at the BOTTOM) — robust to a Playwright
  // retry re-running this same flow in the same session, which would leave
  // TWO matching rows rather than replacing the first.
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
