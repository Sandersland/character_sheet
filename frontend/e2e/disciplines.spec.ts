import { expect, test, type APIRequestContext } from "@playwright/test";

import { login } from "./helpers/auth";
import { collectConsoleErrors } from "./helpers/console";
import { findCharacterByName, restoreResourcePool } from "./helpers/api";

// The Four Elements Monk persona (seeded in global-setup) is Monk L6 with the
// Way of the Four Elements subclass — 2 discipline slots and a ki pool. We
// provision Fangs of the Fire Snake through the API so the cast flow is
// deterministic regardless of prior run state.
async function ensureFangsKnown(request: APIRequestContext, id: string): Promise<void> {
  const charRes = await request.get(`/api/characters/${id}`);
  const char = (await charRes.json()) as { resources?: { disciplinesKnown?: { name: string }[] } };
  const known = char.resources?.disciplinesKnown ?? [];
  if (known.some((d) => d.name === "Fangs of the Fire Snake")) return;

  const catRes = await request.get("/api/disciplines");
  const catalog = (await catRes.json()) as { id: string; name: string }[];
  const fangs = catalog.find((d) => d.name === "Fangs of the Fire Snake")!;
  await request.post(`/api/characters/${id}/resources/transactions`, {
    data: { operations: [{ type: "learnDiscipline", disciplineId: fangs.id }] },
  });
}

async function kiRemaining(request: APIRequestContext, id: string): Promise<number> {
  const res = await request.get(`/api/characters/${id}`);
  const body = (await res.json()) as { resources?: { pools?: { key: string; remaining: number }[] } };
  return body.resources?.pools?.find((p) => p.key === "ki")?.remaining ?? 0;
}

test("disciplines: a Four Elements monk casts an elemental discipline, spending ki", async ({ page }) => {
  await login(page);
  const id = await findCharacterByName(page.request, "Four Elements Monk");
  await ensureFangsKnown(page.request, id);
  await restoreResourcePool(page.request, id, "ki");

  const errors = collectConsoleErrors(page);
  await page.goto(`/characters/${id}`);
  await expect(page.getByRole("heading", { name: /Four Elements Monk/, level: 1 })).toBeVisible();

  // The Elemental Disciplines block renders for a Four Elements monk, with the
  // always-known Elemental Attunement and the learned Fangs of the Fire Snake.
  await expect(page.getByRole("heading", { name: "Elemental Disciplines" })).toBeVisible();
  // The always-known Elemental Attunement renders as its own (expandable) row.
  await expect(page.getByRole("button", { name: /Elemental Attunement/ })).toBeVisible();

  const fangsRow = page
    .locator("li")
    .filter({ hasText: "Fangs of the Fire Snake" })
    .filter({ has: page.getByRole("button", { name: "Cast" }) });
  await expect(fangsRow).toBeVisible();

  // The picker is reachable and opens in-place.
  await page.getByRole("button", { name: /Learn discipline/i }).click();
  await expect(page.getByRole("heading", { name: /Learn a Discipline/ })).toBeVisible();

  // ── Cast: spending ki surfaces a roll toast, and ki drops ──
  const kiBefore = await kiRemaining(page.request, id);
  const castButton = fangsRow.getByRole("button", { name: "Cast" });
  await expect(castButton).toBeEnabled();
  await castButton.click();

  const toast = page.getByRole("status").filter({ hasText: /Fangs of the Fire Snake/ });
  await expect(toast).toBeVisible();
  await expect(toast).toContainText(/fire damage/);

  await expect.poll(() => kiRemaining(page.request, id)).toBe(kiBefore - 1);

  expect(errors).toEqual([]);
});
