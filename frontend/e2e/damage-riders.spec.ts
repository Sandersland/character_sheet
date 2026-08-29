import { expect, test } from "@playwright/test";

import { login } from "./helpers/auth";
import { collectConsoleErrors } from "./helpers/console";
import { enterLiveCombat, createCharacter, uniqueName } from "./helpers/api";

test("damage riders: attuned Flame Tongue adds a typed +2d6 fire term to its attack", async ({ page }) => {
  await page.addInitScript(() => {
    Math.random = () => 0.5;
  });
  await login(page);
  const characterId = await createCharacter(page.request, {
    name: uniqueName("Rider"),
    className: "Fighter",
  });

  const campaign = await page.request.post("/api/campaigns", {
    data: { name: uniqueName("E2E Rider Campaign") },
  });
  expect(campaign.ok(), `create campaign: ${campaign.status()}`).toBeTruthy();
  const { id: campaignId } = (await campaign.json()) as { id: string };

  const attach = await page.request.post(`/api/campaigns/${campaignId}/characters`, {
    data: { characterId },
  });
  expect(attach.ok(), `attach: ${attach.status()}`).toBeTruthy();

  const item = await page.request.post(`/api/campaigns/${campaignId}/items`, {
    data: {
      name: "Flame Tongue",
      category: "weapon",
      rarity: "RARE",
      requiresAttunement: true,
      weapon: { damageDiceCount: 1, damageDiceFaces: 8, damageModifier: 0, damageType: "slashing" },
      capabilities: [
        { kind: "passiveBonus", target: "damage", op: "add", dice: { count: 2, faces: 6, damageType: "fire" } },
      ],
    },
  });
  expect(item.ok(), `create item: ${item.status()}`).toBeTruthy();
  const { id: itemId } = (await item.json()) as { id: string };

  const award = await page.request.post(`/api/campaigns/${campaignId}/items/${itemId}/award`, {
    data: { characterId },
  });
  expect(award.ok(), `award: ${award.status()}`).toBeTruthy();

  const sheet = await page.request.get(`/api/characters/${characterId}`);
  const { inventory } = (await sheet.json()) as { inventory: { id: string; name: string }[] };
  const inventoryItemId = inventory.find((i) => i.name === "Flame Tongue")!.id;
  const equip = await page.request.post(`/api/characters/${characterId}/inventory/transactions`, {
    data: {
      operations: [
        { type: "setEquipped", inventoryItemId, equipped: true },
        { type: "attune", inventoryItemId },
      ],
    },
  });
  expect(equip.ok(), `equip+attune: ${equip.status()}`).toBeTruthy();

  const errors = collectConsoleErrors(page);
  await page.goto(`/characters/${characterId}`);
  await enterLiveCombat(page);
  await expect(page).toHaveURL(/[?&]tab=combat/);

  await page.getByRole("button", { name: /Start combat/i }).click();
  await page.getByRole("button", { name: "Start my turn" }).click();
  await page.getByRole("button", { name: /Use Action/ }).click();
  await page.getByRole("button", { name: "Attack", exact: true }).click();

  const attackSheet = page.getByRole("dialog");

  await attackSheet.getByRole("button", { name: "Roll to hit" }).click();

  const rider = attackSheet.getByRole("button", { name: /Roll \+2d6 fire/ });
  await expect(rider).toBeVisible();
  await rider.click();

  await attackSheet.getByRole("button", { name: "Roll damage", exact: true }).click();
  const done = attackSheet.getByRole("button", { name: /^Done$/ });
  // ResolutionRail's CompleteButton ("Done") commits the swing without closing
  // the sheet; AttackSheetFooter then relabels its own close button to "Done"
  // too (same handler, same accessible name) — this second click is that one.
  await done.click();
  await done.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.getByRole("button", { name: /open session log/i }).click();
  const logDrawer = page.getByRole("dialog", { name: "Session Log" });
  // Pins sessionLogFeed.ts's effectTailSegments format: one swing row carries
  // both damage terms in a single sentence, not a separate roll-log row.
  await expect(logDrawer.getByText(/hit for \d+ slashing \+ \d+ fire/).first()).toBeVisible();
  // The only legitimate "Rolled " line left is buildAbilityRollRow's own
  // "Rolled Initiative" from starting combat.
  await expect(logDrawer.getByText(/^Rolled (?!Initiative)/)).toHaveCount(0);

  expect(errors).toEqual([]);
});
