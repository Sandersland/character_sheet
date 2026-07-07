import { expect, test } from "@playwright/test";

import { login } from "./helpers/auth";
import { collectConsoleErrors } from "./helpers/console";
import { createCharacter, uniqueName } from "./helpers/api";

// A DM authors a magic item with a passiveBonus capability + attunement, awards
// it to a held character, and the player attunes it from the sheet (#546).
test("attunement: award a capability item, then attune it from the sheet", async ({ page }) => {
  await login(page);
  const characterId = await createCharacter(page.request, {
    name: uniqueName("Attuner"),
    className: "Wizard",
  });

  // The owner-DM creates a campaign, attaches the character, authors the item,
  // and awards it — all through the same REST surface the app uses.
  const campaign = await page.request.post("/api/campaigns", {
    data: { name: uniqueName("E2E Attune Campaign") },
  });
  expect(campaign.ok(), `create campaign: ${campaign.status()}`).toBeTruthy();
  const { id: campaignId } = (await campaign.json()) as { id: string };

  const attach = await page.request.post(`/api/campaigns/${campaignId}/characters`, {
    data: { characterId },
  });
  expect(attach.ok(), `attach: ${attach.status()}`).toBeTruthy();

  const item = await page.request.post(`/api/campaigns/${campaignId}/items`, {
    data: {
      name: "Cloak of the Wary Wizard",
      category: "gear",
      rarity: "RARE",
      requiresAttunement: true,
      capabilities: [
        { kind: "passiveBonus", target: "skill", op: "add", value: 2, targetKey: "stealth" },
      ],
    },
  });
  expect(item.ok(), `create item: ${item.status()}`).toBeTruthy();
  const { id: itemId } = (await item.json()) as { id: string };

  const award = await page.request.post(`/api/campaigns/${campaignId}/items/${itemId}/award`, {
    data: { characterId },
  });
  expect(award.ok(), `award: ${award.status()}`).toBeTruthy();

  const errors = collectConsoleErrors(page);
  await page.goto(`/characters/${characterId}`);
  await expect(page.getByRole("heading", { name: "Inventory", exact: true })).toBeVisible();

  // The card shows the capability + the requires-attunement state, and the
  // sheet shows the derived 0/3 attunement readout.
  await expect(page.getByText("+2 Stealth")).toBeVisible();
  await expect(page.getByText("Requires attunement")).toBeVisible();
  await expect(page.getByText("0/3 attuned")).toBeVisible();

  // Attune from the sheet — the pill flips and the readout increments.
  await page.getByRole("button", { name: "Attune", exact: true }).click();
  await expect(page.getByRole("button", { name: "Attuned" })).toBeVisible();
  await expect(page.getByText("1/3 attuned")).toBeVisible();

  expect(errors).toEqual([]);
});
