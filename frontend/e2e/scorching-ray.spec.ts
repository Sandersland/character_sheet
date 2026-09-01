import { expect, test } from "@playwright/test";

import { login } from "./helpers/auth";
import { collectConsoleErrors } from "./helpers/console";
import { createSessionCharacter, enterLiveCombat, learnSpells, startCombatAndTurn, uniqueName } from "./helpers/api";

const WIZARD_L5_XP = 6500;

async function slotUsed(request: import("@playwright/test").APIRequestContext, characterId: string, level: number): Promise<number> {
  const response = await request.get(`/api/characters/${characterId}`);
  expect(response.ok(), `load character: ${response.status()}`).toBeTruthy();
  const character = (await response.json()) as { spellcasting?: { slots?: { level: number; used: number }[] } };
  const slot = character.spellcasting?.slots?.find((s) => s.level === level);
  expect(slot, `no level ${level} slot on this character`).toBeTruthy();
  return slot!.used;
}

// Scorching Ray is the multi-instance epic's canonical mixed-verdict case (#1985): three rays, each
// with its own attack roll and its own damage — a partial hit unrepresentable before #1981/#1983's
// instances[] model. Math.random pinned to 0.5 (damage-riders.spec.ts's own pattern) lands every d20
// on 11 — never a nat1/nat20 — so autoVerdict leaves every ray ambiguous and the strip's Miss/Crit!/
// implicit-hit calls are exercised deliberately rather than by chance.
test("scorching ray: three independently-verdicted rays collapse into one combat-log entry; undo restores the level-2 slot (LIFO)", async ({ page }) => {
  await page.addInitScript(() => {
    Math.random = () => 0.5;
  });
  await login(page);
  const characterId = await createSessionCharacter(page.request, {
    name: uniqueName("Ray Wizard"),
    className: "Wizard",
    experiencePoints: WIZARD_L5_XP,
  });
  await learnSpells(page.request, characterId, ["Scorching Ray"]);

  const usedBeforeCast = await slotUsed(page.request, characterId, 2);

  const errors = collectConsoleErrors(page);
  await page.goto(`/characters/${characterId}`);
  await enterLiveCombat(page);
  await expect(page).toHaveURL(/[?&]tab=combat/);
  await startCombatAndTurn(page);

  await page.getByRole("button", { name: /Use Action/ }).click();
  await page.getByRole("button", { name: "Cast a spell" }).click();
  await page.getByRole("button", { name: /^Scorching Ray/ }).click();

  const sheet = page.getByRole("dialog");
  const rays = sheet.getByRole("listitem");
  await expect(rays).toHaveCount(3);

  // Ray 1: called Miss — no damage.
  await rays.nth(0).getByRole("button", { name: "Roll to hit" }).click();
  await rays.nth(0).getByRole("button", { name: "Miss" }).click();

  // Ray 2: called Crit — rolls crit damage.
  await rays.nth(1).getByRole("button", { name: "Roll to hit" }).click();
  await rays.nth(1).getByRole("button", { name: "Crit!" }).click();
  await rays.nth(1).getByRole("button", { name: "Roll crit damage" }).click();

  // Ray 3: left ambiguous — rolling damage IS the implicit hit call (#811, mirrored per instance).
  await rays.nth(2).getByRole("button", { name: "Roll to hit" }).click();
  await rays.nth(2).getByRole("button", { name: "Roll damage" }).click();

  await sheet.getByRole("button", { name: "Done" }).click();
  // BottomSheet's own header Close and SpellResolverFooter's Close are both named
  // "Close" (same convention damage-riders.spec.ts hits) — the footer one is last in DOM order.
  await sheet.getByRole("button", { name: "Close" }).last().click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  expect(await slotUsed(page.request, characterId, 2)).toBe(usedBeforeCast + 1);

  await page.getByRole("button", { name: /open session log/i }).click();
  const logDrawer = page.getByRole("dialog", { name: "Session Log" });
  const castRow = logDrawer.locator("li").filter({ hasText: "Scorching Ray" });
  await expect(castRow).toHaveCount(1);
  // Mixed verdicts (one crit) collapse to the crit-led summary sentence (buildInstancedResolutionRow).
  await expect(castRow.getByText(/critical hit!/)).toBeVisible();

  await castRow.locator("summary").click();
  // Three drill-in lines, one per ray: buildInstanceDrillRow only labels a row that carries a
  // formula (DrillInLine suppresses the label on a bare note, matching the un-instanced miss's own
  // convention) — the missed ray's line is the bare "Missed" note, unlabeled by design.
  await expect(castRow.getByText("Missed")).toBeVisible();
  await expect(castRow.getByText("Instance 2")).toBeVisible();
  await expect(castRow.getByText("Instance 3")).toBeVisible();
  await expect(castRow.getByText("· Critical hit!")).toBeVisible();
  await logDrawer.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.getByRole("button", { name: "Activity" }).click();
  const activity = page.getByRole("dialog", { name: "Character Activity" });
  await activity.getByRole("button", { name: "Undo" }).click();
  // pickUndoableBatchKey re-arms "Undo" on the next-most-recent batch once ours reverts (LIFO, not
  // one-shot) — a "reverted" badge on our own row is the completion signal, not the button
  // disappearing outright.
  const revertedRow = activity.locator("li").filter({ hasText: /scorching ray/i });
  await expect(revertedRow.getByText("reverted")).toBeVisible();
  await activity.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await expect
    .poll(() => slotUsed(page.request, characterId, 2))
    .toBe(usedBeforeCast);

  expect(errors).toEqual([]);
});
