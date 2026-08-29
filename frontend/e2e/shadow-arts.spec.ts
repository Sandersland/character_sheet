import { expect, test, type APIRequestContext } from "@playwright/test";

import { login } from "./helpers/auth";
import { collectConsoleErrors } from "./helpers/console";
import { closeSpellbook, findCharacterByName, gotoSheet, openSpellbook, restoreResourcePool } from "./helpers/api";

async function focusRemaining(request: APIRequestContext, id: string): Promise<number> {
  const res = await request.get(`/api/characters/${id}`);
  const body = (await res.json()) as { resources?: { pools?: { key: string; remaining: number }[] } };
  return body.resources?.pools?.find((p) => p.key === "focus")?.remaining ?? 0;
}

test("shadow arts: a Warrior of Shadow monk casts Darkness for 1 focus, taking concentration", async ({ page }) => {
  await login(page);
  const id = await findCharacterByName(page.request, "Shadow Monk");
  await restoreResourcePool(page.request, id, "focus");

  const errors = collectConsoleErrors(page);
  await page.goto(`/characters/${id}`);
  await expect(page.getByRole("heading", { name: /Shadow Monk/, level: 1 })).toBeVisible();

  await page.getByRole("tab", { name: "Class" }).click();

  await expect(page.getByRole("heading", { name: "Shadow Arts" })).toBeVisible();
  const darknessRow = page
    .locator("li")
    .filter({ hasText: "Darkness" })
    .filter({ has: page.getByRole("button", { name: "Cast" }) })
    .first();
  await expect(darknessRow).toBeVisible();

  const focusBefore = await focusRemaining(page.request, id);
  await darknessRow.getByRole("button", { name: "Cast" }).click();
  await expect.poll(() => focusRemaining(page.request, id)).toBe(focusBefore - 1);
  await expect(page.getByText(/Shadow Arts: Darkness/).first()).toBeVisible();

  expect(errors).toEqual([]);
});

test("shadow arts: a granted Minor Illusion shows a subclass badge, no Remove, and casts via the record door", async ({ page }) => {
  await login(page);
  const id = await findCharacterByName(page.request, "Shadow Monk");

  const errors = collectConsoleErrors(page);
  await gotoSheet(page, id, "magic");
  await expect(page.getByRole("heading", { name: /Shadow Monk/, level: 1 })).toBeVisible();

  await openSpellbook(page);

  const illusionRow = page
    .getByRole("listitem")
    .filter({ has: page.getByRole("button", { name: "Open Minor Illusion" }) });
  await expect(illusionRow).toBeVisible();
  await expect(illusionRow.getByText("subclass")).toBeVisible();
  await expect(illusionRow.getByRole("button", { name: /Remove Minor Illusion/ })).toHaveCount(0);
  await closeSpellbook(page);

  await page.getByRole("button", { name: "Cast a spell" }).click();
  await page.getByRole("button", { name: "Open Minor Illusion" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: /^Cast Minor Illusion/ }).click();
  await expect(dialog).not.toBeVisible();

  expect(errors).toEqual([]);
});
