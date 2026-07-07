import { expect, test, type APIRequestContext } from "@playwright/test";

import { login } from "./helpers/auth";
import { collectConsoleErrors } from "./helpers/console";
import { createCharacter, uniqueName } from "./helpers/api";

// #572: a DM authors a Ring as gear placed in the RING slot from the campaign
// item form, awards it to a member, and the player equips it on the paper doll —
// including equip-and-replace once both ring cells are full.

async function createCampaign(request: APIRequestContext): Promise<string> {
  const response = await request.post("/api/campaigns", { data: { name: uniqueName("E2E Slot") } });
  expect(response.ok(), `create campaign: ${response.status()}`).toBeTruthy();
  const { id } = (await response.json()) as { id: string };
  return id;
}

// Author a gear ring straight through the campaign-item API (existing surface),
// used only to top up the slot for the replace step.
async function createRing(request: APIRequestContext, campaignId: string, name: string): Promise<string> {
  const response = await request.post(`/api/campaigns/${campaignId}/items`, {
    data: { name, category: "gear", slot: "RING" },
  });
  expect(response.ok(), `create ring ${name}: ${response.status()}`).toBeTruthy();
  const { id } = (await response.json()) as { id: string };
  return id;
}

async function awardItem(
  request: APIRequestContext,
  campaignId: string,
  itemId: string,
  characterId: string,
): Promise<void> {
  const response = await request.post(`/api/campaigns/${campaignId}/items/${itemId}/award`, {
    data: { characterId },
  });
  expect(response.ok(), `award ${itemId}: ${response.status()}`).toBeTruthy();
}

test("DM authors a slotted ring, awards it, and the player equips + replaces it", async ({ page }) => {
  await login(page);
  const errors = collectConsoleErrors(page);

  const campaignId = await createCampaign(page.request);
  const characterId = await createCharacter(page.request, {
    name: uniqueName("Ring Bearer"),
    className: "Fighter",
  });
  const attach = await page.request.post(`/api/campaigns/${campaignId}/characters`, {
    data: { characterId },
  });
  expect(attach.ok(), `attach character: ${attach.status()}`).toBeTruthy();

  // PL-1: the DM authors a Ring in the item form — Gear category reveals the Slot
  // picker; choose the RING slot and save.
  await page.goto(`/campaigns/${campaignId}/manage`);
  await page.getByRole("button", { name: /new item/i }).click();
  await page.getByLabel("Name *").fill("Band of Alpha");
  await page.getByRole("radio", { name: "Gear" }).click();
  await page.getByLabel("Slot").selectOption("RING");
  await page.getByRole("button", { name: "Create item" }).click();
  await expect(page.getByRole("link", { name: "Band of Alpha" })).toBeVisible();

  // Resolve the authored ring's id, plus two more rings to fill the second cell
  // and drive the replace, then award all three to the member.
  const listResponse = await page.request.get(`/api/campaigns/${campaignId}/items`);
  expect(listResponse.ok(), `list items: ${listResponse.status()}`).toBeTruthy();
  const items = (await listResponse.json()) as { id: string; name: string; slot?: string }[];
  const alpha = items.find((i) => i.name === "Band of Alpha");
  expect(alpha, "authored ring present").toBeTruthy();
  // The authored slot survived the round-trip.
  expect(alpha!.slot).toBe("RING");

  const betaId = await createRing(page.request, campaignId, "Band of Beta");
  const gammaId = await createRing(page.request, campaignId, "Band of Gamma");
  await awardItem(page.request, campaignId, alpha!.id, characterId);
  await awardItem(page.request, campaignId, betaId, characterId);
  await awardItem(page.request, campaignId, gammaId, characterId);

  // PL-3: the player opens the sheet, switches to the Worn paper doll, and the
  // awarded ring is equippable in the RING slot.
  await page.goto(`/characters/${characterId}`);
  await expect(page.getByRole("heading", { name: "Inventory", exact: true })).toBeVisible();
  await page.getByRole("radio", { name: "Worn" }).click();

  // The two RING cells relabel by id sort order, so assert placement by ring name
  // (which cell it lands in is incidental).
  await page.getByRole("button", { name: /Ring 1 slot, empty/ }).click();
  await expect(page.getByText("Equip Ring 1")).toBeVisible();
  await page.getByRole("button", { name: /Band of Alpha/ }).click();
  await expect(page.getByRole("button", { name: /Ring [12]: Band of Alpha/ })).toBeVisible();

  // Fill the remaining cell — the RING slot is now at capacity (2/2).
  await page.getByRole("button", { name: /Ring 2 slot, empty/ }).click();
  await expect(page.getByText("Equip Ring 2")).toBeVisible();
  await page.getByRole("button", { name: /Band of Beta/ }).click();
  await expect(page.getByRole("button", { name: /Ring [12]: Band of Beta/ })).toBeVisible();

  // PL-4: with the slot full, Swap replaces the occupant with the third ring.
  await page.getByRole("button", { name: /Ring [12]: Band of Alpha/ }).click();
  await page.getByRole("button", { name: "Swap" }).click();
  await page.getByRole("button", { name: /Band of Gamma/ }).click();
  await expect(page.getByRole("button", { name: /Ring [12]: Band of Gamma/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Ring [12]: Band of Alpha/ })).toHaveCount(0);

  expect(errors).toEqual([]);
});
