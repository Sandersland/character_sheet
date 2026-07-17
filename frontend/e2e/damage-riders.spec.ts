import { expect, test } from "@playwright/test";

import { login } from "./helpers/auth";
import { collectConsoleErrors } from "./helpers/console";
import { createCharacter, uniqueName } from "./helpers/api";

// A Flame Tongue-style weapon (dice-valued passiveBonus damage cap, requires
// attunement) adds a typed +2d6 fire rider to its damage roll in the attack
// picker while attuned/equipped, rolled through the dice engine (#547).
test("damage riders: attuned Flame Tongue adds a typed +2d6 fire term to its attack", async ({ page }) => {
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

  // Equip + attune the awarded weapon through the same transactions endpoint the app uses.
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
  await page.getByRole("button", { name: /(Start|Resume|Join) session|Go to fight/i }).click();
  await expect(page).toHaveURL(/[?&]tab=combat/);

  await page.getByRole("button", { name: /Start combat/i }).click();
  await page.getByRole("button", { name: "Start my turn" }).click();
  await page.getByRole("button", { name: /Use Action/ }).click();
  await page.getByRole("button", { name: "Attack", exact: true }).click();

  // The Damage card (which hosts the on-hit riders) is inert until the first
  // Roll to hit binds it to the selected form — the default is the equipped
  // Flame Tongue (#786).
  await page.getByRole("button", { name: /Roll to hit/ }).click();

  // The bound Damage card exposes a typed on-hit rider button; rolling it logs a
  // fire damage roll. The rider only shows because the item is attuned + equipped.
  const rider = page.getByRole("button", { name: /Roll \+2d6 fire/ });
  await expect(rider).toBeVisible();
  await rider.click();

  // The attack picker is a modal bottom sheet (#729) — dismiss it before reading.
  await page.keyboard.press("Escape");
  // The rider damage lands on the session log — the always-visible right rail on
  // desktop (#964; the Turn/Log sub-nav is mobile-only).
  await expect(
    page.getByRole("complementary", { name: /Session log/i }).getByText(/fire/i).first(),
  ).toBeVisible();

  expect(errors).toEqual([]);
});
