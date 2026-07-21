import { expect, test, type APIRequestContext } from "@playwright/test";

import { login } from "./helpers/auth";
import { collectConsoleErrors } from "./helpers/console";
import { closeSpellbook, findCharacterByName, gotoSheet, openSpellbook, restoreResourcePool } from "./helpers/api";

// The Shadow Monk persona (seeded in global-setup) is Monk L6 with the Way of
// Shadow subclass — Shadow Arts unlock at L3, and Minor Illusion is granted.
async function kiRemaining(request: APIRequestContext, id: string): Promise<number> {
  const res = await request.get(`/api/characters/${id}`);
  const body = (await res.json()) as { resources?: { pools?: { key: string; remaining: number }[] } };
  return body.resources?.pools?.find((p) => p.key === "ki")?.remaining ?? 0;
}

test("shadow arts: a Way of Shadow monk casts Shadow Arts, taking concentration + a Stealth buff", async ({ page }) => {
  await login(page);
  const id = await findCharacterByName(page.request, "Shadow Monk");
  await restoreResourcePool(page.request, id, "ki");

  const errors = collectConsoleErrors(page);
  await page.goto(`/characters/${id}`);
  await expect(page.getByRole("heading", { name: /Shadow Monk/, level: 1 })).toBeVisible();

  // Class features (incl. Shadow Arts) moved to their own tab (#1169).
  await page.getByRole("tab", { name: "Class" }).click();

  // The Shadow Arts block renders with the 4 flat 2-ki arts.
  await expect(page.getByRole("heading", { name: "Shadow Arts" })).toBeVisible();
  const darknessRow = page
    .locator("li")
    .filter({ hasText: "Darkness" })
    .filter({ has: page.getByRole("button", { name: "Cast" }) })
    .first();
  await expect(darknessRow).toBeVisible();

  // ── Cast Darkness: ki drops and the concentration handoff appears ──
  const kiBefore = await kiRemaining(page.request, id);
  await darknessRow.getByRole("button", { name: "Cast" }).click();
  await expect.poll(() => kiRemaining(page.request, id)).toBe(kiBefore - 2);
  await expect(page.getByText(/Shadow Arts: Darkness/).first()).toBeVisible();

  // ── Cast Pass without Trace: its +10 Stealth shows on the Stealth row ──
  const pwtRow = page
    .locator("li")
    .filter({ hasText: "Pass without Trace" })
    .filter({ has: page.getByRole("button", { name: "Cast" }) })
    .first();
  await pwtRow.getByRole("button", { name: "Cast" }).click();
  // Pass without Trace's +10 shows inline on the Stealth row — all 18 skills are
  // inline roll rows on the Overview now (#957), no "All N" modal.
  const stealthRow = page.locator("li").filter({ hasText: "Stealth" }).first();
  await expect(stealthRow.getByText(/\+10/)).toBeVisible();

  expect(errors).toEqual([]);
});

test("shadow arts: a granted Minor Illusion shows a subclass badge, no Remove, and casts via the record door", async ({ page }) => {
  await login(page);
  const id = await findCharacterByName(page.request, "Shadow Monk");

  const errors = collectConsoleErrors(page);
  // The spellbook (with the granted Minor Illusion) lives on the Magic tab.
  await gotoSheet(page, id, "magic");
  await expect(page.getByRole("heading", { name: /Shadow Monk/, level: 1 })).toBeVisible();

  // The spellbook rows live in the grimoire, opened via "Manage spellbook →" —
  // view/manage only (#1162), no Cast affordance there anymore.
  await openSpellbook(page);

  // The granted Minor Illusion appears in the spellbook with a subclass badge.
  // Scope to the spellbook row (has the "Open …" detail-card button) — the
  // Shadow Arts class-feature description row also names Minor Illusion but
  // has no such button.
  const illusionRow = page
    .getByRole("listitem")
    .filter({ has: page.getByRole("button", { name: "Open Minor Illusion" }) });
  await expect(illusionRow).toBeVisible();
  await expect(illusionRow.getByText("subclass")).toBeVisible();
  // No Remove ✕ for a derived grant.
  await expect(illusionRow.getByRole("button", { name: /Remove Minor Illusion/ })).toHaveCount(0);
  await closeSpellbook(page);

  // Casting a granted cantrip goes through the record's single Cast door.
  await page.getByRole("button", { name: "Cast a spell" }).click();
  await page.getByRole("button", { name: "Open Minor Illusion" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: /^Cast Minor Illusion/ }).click();
  await expect(dialog).not.toBeVisible();

  expect(errors).toEqual([]);
});
