import { expect, test, type APIRequestContext } from "@playwright/test";

import { login } from "./helpers/auth";
import { collectConsoleErrors } from "./helpers/console";
import { findCharacterByName, gotoSheet, restoreResourcePool } from "./helpers/api";

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
  // Stealth isn't a monk proficiency, so its buffed row lives in the full skills
  // table behind the Overview "All N →" expander (curated skills redesign #923).
  await page.getByRole("button", { name: /All \d+ →/ }).click();
  const stealthRow = page.getByRole("row").filter({ hasText: "Stealth" });
  await expect(stealthRow.getByText(/\+10/)).toBeVisible();

  expect(errors).toEqual([]);
});

test("shadow arts: a granted Minor Illusion shows a subclass badge, no Remove, and casts", async ({ page }) => {
  await login(page);
  const id = await findCharacterByName(page.request, "Shadow Monk");

  const errors = collectConsoleErrors(page);
  // The spellbook (with the granted Minor Illusion) lives on the Magic tab.
  await gotoSheet(page, id, "magic");
  await expect(page.getByRole("heading", { name: /Shadow Monk/, level: 1 })).toBeVisible();

  // The granted Minor Illusion appears in the spellbook with a subclass badge.
  // Scope to the spellbook row (has a Cast button) — the Shadow Arts class-feature
  // description row also names Minor Illusion but has no Cast button.
  const illusionRow = page
    .getByRole("listitem")
    .filter({ hasText: "Minor Illusion" })
    .filter({ has: page.getByRole("button", { name: "Cast" }) });
  await expect(illusionRow).toBeVisible();
  await expect(illusionRow.getByText("subclass")).toBeVisible();
  // No Remove ✕ for a derived grant.
  await expect(illusionRow.getByRole("button", { name: /Remove Minor Illusion/ })).toHaveCount(0);
  // Cast still works (no error).
  await illusionRow.getByRole("button", { name: "Cast" }).click();

  expect(errors).toEqual([]);
});
