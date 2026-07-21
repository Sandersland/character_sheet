import { expect, test, type Page } from "@playwright/test";

import { login } from "./helpers/auth";
import { collectConsoleErrors } from "./helpers/console";
import { createCharacter, gotoSheet, learnSpells, uniqueName } from "./helpers/api";

const WIZARD_L5_XP = 6500;

// Remaining slots = count of available (expend) pips for that level.
function slotRemaining(page: Page, level: number): Promise<number> {
  return page.getByTitle(`Expend a level ${level} slot`).count();
}

// Casting lives behind the record view's single "Cast a spell" door (#1162):
// open the door, tap the spell to open its shared detail card, optionally pick
// an upcast slot, then Cast. The door closes itself afterward.
async function castViaDoor(page: Page, spellName: string, slotLevel?: number): Promise<void> {
  await page.getByRole("button", { name: "Cast a spell" }).click();
  await page.getByRole("button", { name: new RegExp(`^Open ${spellName}$`) }).click();
  const dialog = page.getByRole("dialog");
  if (slotLevel) {
    await dialog.getByRole("button", { name: new RegExp(`^L${slotLevel}`) }).click();
  }
  await dialog.getByRole("button", { name: new RegExp(`^Cast ${spellName}`) }).click();
  await expect(dialog).not.toBeVisible();
}

test("spellcasting: leveled cast, upcast, and free cantrip drive the slot pips", async ({ page }) => {
  await login(page);
  const id = await createCharacter(page.request, {
    name: uniqueName("Cast Wizard"),
    className: "Wizard",
    experiencePoints: WIZARD_L5_XP,
  });
  await learnSpells(page.request, id, ["Fire Bolt", "Magic Missile"]);

  const errors = collectConsoleErrors(page);
  await gotoSheet(page, id, "magic");
  await expect(page.getByRole("heading", { name: "Spell Slots" })).toBeVisible();

  const l1Before = await slotRemaining(page, 1);
  const l2Before = await slotRemaining(page, 2);

  // ── Cast Magic Missile with a level-1 slot ──────────────────────────────────
  await castViaDoor(page, "Magic Missile", 1);

  // ── Upcast Magic Missile with a level-2 slot ────────────────────────────────
  await castViaDoor(page, "Magic Missile", 2);

  // ── Cantrip consumes no slot (no slot picker offered) ───────────────────────
  await castViaDoor(page, "Fire Bolt");

  // One level-1 slot spent (base cast) + one level-2 slot spent (upcast); the
  // cantrip drove no pips.
  await expect.poll(() => slotRemaining(page, 1)).toBe(l1Before - 1);
  await expect.poll(() => slotRemaining(page, 2)).toBe(l2Before - 1);

  expect(errors).toEqual([]);
});
