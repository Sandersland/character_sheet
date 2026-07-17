import { expect, test, type Page } from "@playwright/test";

import { login } from "./helpers/auth";
import { collectConsoleErrors } from "./helpers/console";
import {
  closeSpellbook,
  createCharacter,
  gotoSheet,
  learnSpells,
  openSpellbook,
  uniqueName,
} from "./helpers/api";

const WIZARD_L5_XP = 6500;

// Remaining slots = count of available (expend) pips for that level.
function slotRemaining(page: Page, level: number): Promise<number> {
  return page.getByTitle(`Expend a level ${level} slot`).count();
}

function spellRow(page: Page, name: string) {
  return page.getByRole("listitem").filter({ hasText: name });
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

  // Spell rows (with their upcast slot picker) live in the grimoire; the
  // interactive slot pips live on the record. Open the grimoire to cast the
  // three spells, then return to the record to verify the pips.
  await openSpellbook(page);

  // ── Cast Magic Missile with a level-1 slot ──────────────────────────────────
  await spellRow(page, "Magic Missile").getByRole("button", { name: "Cast" }).click();
  await page.getByTitle(/Magic Missile with a level 1 slot/).click();

  // ── Upcast Magic Missile with a level-2 slot ────────────────────────────────
  await spellRow(page, "Magic Missile").getByRole("button", { name: "Cast" }).click();
  await page.getByTitle(/Magic Missile with a level 2 slot/).click();

  // ── Cantrip consumes no slot ────────────────────────────────────────────────
  await spellRow(page, "Fire Bolt").getByRole("button", { name: "Cast" }).click();
  await expect(page.getByText(/Fire Bolt/).first()).toBeVisible();

  await closeSpellbook(page);

  // Back on the record: one level-1 slot spent (base cast) + one level-2 slot
  // spent (upcast); the cantrip drove no pips.
  await expect.poll(() => slotRemaining(page, 1)).toBe(l1Before - 1);
  await expect.poll(() => slotRemaining(page, 2)).toBe(l2Before - 1);

  expect(errors).toEqual([]);
});
