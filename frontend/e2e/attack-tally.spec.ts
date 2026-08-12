import { expect, test } from "@playwright/test";

import { login } from "./helpers/auth";
import { collectConsoleErrors } from "./helpers/console";
import { enterLiveCombat, findCharacterByName, startCombatAndTurn } from "./helpers/api";

// Shared setup: deterministic dice (face = 1 + floor(0.5 * faces) → d20 always
// 11, never nat 20/1, so no auto-verdict steals the manual-call paths under
// test), then drive the Battle Master persona (Fighter L5, Extra Attack → 2
// attacks) into an active turn with the Attack sheet open.
async function openAttackSheet(page: import("@playwright/test").Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    Math.random = () => 0.5;
  });
  await login(page);
  const id = await findCharacterByName(page.request, "Battle Master");

  const errors = collectConsoleErrors(page);
  await page.goto(`/characters/${id}`);
  // Mobile header has no h1 (#1027 — the identity is a "Switch character" button);
  // that button appearing confirms the sheet rendered.
  await expect(page.getByRole("button", { name: "Switch character" })).toBeVisible();

  await enterLiveCombat(page);
  await expect(page).toHaveURL(/[?&]tab=combat/);

  await startCombatAndTurn(page);

  await page.getByRole("button", { name: /Use Action/ }).click();
  await page.getByRole("button", { name: "Attack", exact: true }).click();
  return { errors, sheet: page.getByRole("dialog") };
}

// #802/#811, rewired onto the shared resolver (epic #1827, #1831/#1832): rolling
// damage is still the implicit hit call, and an un-called attack still reads as
// unresolved rather than a hit. What changed: ResolutionRail's own "Done" is a
// real commit (ONE resolveAction event) and — with attacks still unspent —
// auto-re-arms the SAME rail to step 1 for the next Extra Attack swing, with no
// intermediate tap. The old in-sheet "Skip — roll next attack" escape hatch is
// gone (InlineAttackPicker's own header comment: no "skip, leave this one
// unresolved" affordance survived the migration) — closing the sheet before a
// swing's "Done" is now the only way to leave it unresolved for the Turn-summary
// banner, same mechanism the Resume flow already used pre-#1832.
test("attack tally: implicit hit auto-advances the rail; a swing closed mid-roll resolves via Resume + the Turn summary banner; dismiss survives reload (mobile)", async ({ page }) => {
  const { errors, sheet } = await openAttackSheet(page);

  // Attack 1 — the tally strip appears; the un-called row asks "hit or miss?".
  await sheet.getByRole("button", { name: "Roll to hit" }).click();
  await expect(sheet.getByText("This action")).toBeVisible();
  await expect(sheet.getByText(/Ask your DM/)).toBeVisible();

  // Rolling damage is the implicit hit call (#811): the row resolves to Hit.
  await sheet.getByRole("button", { name: "Roll damage", exact: true }).click();
  await expect(sheet.getByText("✓ Hit")).toBeVisible();

  // "Done" commits the swing's ONE resolveAction event and — attacks still
  // unspent — immediately re-arms the SAME rail to step 1 for attack 2 (no
  // separate "Next" tap, #1831).
  await sheet.getByRole("button", { name: /^Done$/ }).click();
  await expect(sheet.getByText("✓ Hit")).toHaveCount(0);
  await expect(sheet.getByRole("button", { name: "Roll to hit" })).toBeVisible();

  // Close before rolling attack 2 at all — the action stays live for Resume.
  await sheet.getByRole("button", { name: "Close" }).last().click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const resume = page.getByRole("button", { name: /Resume attack — 1 of 2 remaining/ });
  await expect(resume).toBeVisible();

  // Reopen — roll attack 2's to-hit and close WITHOUT resolving it, leaving it
  // unresolved in the tally (the rail's completion model requires a full
  // resolve before "Done"; closing mid-swing is the only remaining deferral).
  await resume.click();
  await expect(sheet.getByText("This action")).toBeVisible();
  await sheet.getByRole("button", { name: "Roll to hit" }).click();
  await sheet.getByRole("button", { name: "Close" }).last().click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // Turn-summary banner: attack 2 never claims a hit — it asks, and resolving
  // Miss inline settles the line.
  await expect(page.getByText("Turn summary")).toBeVisible();
  const question = page.getByRole("button", { name: "hit or miss?" });
  await expect(question).toBeVisible();
  await question.click();
  await page.getByRole("button", { name: /^Miss — / }).click();
  await expect(page.getByText(/miss \(to-hit \d+\)/)).toBeVisible();
  await expect(page.getByRole("button", { name: "hit or miss?" })).toHaveCount(0);

  // Dismiss clears the persisted tally (#812) — a reload mid-turn must not
  // resurrect the banner from the localStorage turn snapshot.
  await page.getByRole("button", { name: /Dismiss/ }).click();
  await expect(page.getByText("Turn summary")).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("button", { name: "End turn" })).toBeVisible();
  await expect(page.getByText("Turn summary")).toHaveCount(0);

  expect(errors).toEqual([]);
});

// The banner's inline damage roll: a swing left unresolved (closed after
// to-hit, never given a verdict) grows a Roll-damage button on its own line —
// no sheet reopen (#811). Two unresolved rows are produced the same way the
// single-row case above is — roll to-hit, close before "Done" — visited twice
// via Resume, since the in-sheet "Skip — roll next attack" gesture that used to
// produce both in one sheet visit is retired (#1832).
test("banner inline resolve: Hit grows an on-line damage roll (mobile)", async ({ page }) => {
  const { errors, sheet } = await openAttackSheet(page);

  // Roll attack 1's to-hit and close without resolving it.
  await sheet.getByRole("button", { name: "Roll to hit" }).click();
  await sheet.getByRole("button", { name: "Close" }).last().click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // Resume — roll attack 2's to-hit and close it unresolved too, so both rows
  // sit unresolved in the tally at once.
  await page.getByRole("button", { name: /Resume attack — 1 of 2 remaining/ }).click();
  const sheet2 = page.getByRole("dialog");
  await expect(sheet2.getByText("This action")).toBeVisible();
  await sheet2.getByRole("button", { name: "Roll to hit" }).click();
  await sheet2.getByRole("button", { name: "Close" }).last().click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // Two unresolved lines; resolve the first as a Hit → inline Roll damage.
  const questions = page.getByRole("button", { name: "hit or miss?" });
  await expect(questions).toHaveCount(2);
  await questions.first().click();
  await page.getByRole("button", { name: /^Hit — / }).click();
  await page.getByRole("button", { name: /^Roll damage — / }).click();
  await expect(page.getByText(/hit — to-hit \d+ — \d+ damage/)).toBeVisible();

  expect(errors).toEqual([]);
});

// #834's two-tap "Next re-arms step 1" gesture is retired (#1831): the rail's
// own completion tap ("Done") both commits the swing's ONE resolveAction event
// AND — via useAttackTallyBridge's re-arm effect — resets the SAME rail to
// step 1 for the next Extra Attack swing in one motion, with no intermediate
// confirmation tap.
test("resolved attack: Done commits one swing and auto-re-arms step 1 for the next (mobile)", async ({ page }) => {
  const { errors, sheet } = await openAttackSheet(page);

  // Resolve attack 1 (damage = implicit hit).
  await sheet.getByRole("button", { name: "Roll to hit" }).click();
  await sheet.getByRole("button", { name: "Roll damage", exact: true }).click();
  await expect(sheet.getByText("✓ Hit")).toBeVisible();

  const done = sheet.getByRole("button", { name: /^Done$/ });
  await expect(done).toBeVisible();
  await done.click();

  // The rail resets to step 1, armed fresh for attack 2 — no "Next" tap, and
  // no already-rolled attack 2 waiting either.
  await expect(sheet.getByText("✓ Hit")).toHaveCount(0);
  const rollAttack2 = sheet.getByRole("button", { name: "Roll to hit" });
  await expect(rollAttack2).toBeVisible();
  await rollAttack2.click();
  await expect(sheet.getByText(/Ask your DM/)).toBeVisible();

  expect(errors).toEqual([]);
});
