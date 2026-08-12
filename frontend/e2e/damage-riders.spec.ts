import { expect, test } from "@playwright/test";

import { login } from "./helpers/auth";
import { collectConsoleErrors } from "./helpers/console";
import { enterLiveCombat, createCharacter, uniqueName } from "./helpers/api";

// A Flame Tongue-style weapon (dice-valued passiveBonus damage cap, requires
// attunement) adds a typed +2d6 fire rider to its damage roll in the attack
// picker while attuned/equipped, rolled through the dice engine (#547). Since
// #1843 the rider merges into the SAME resolveAction commit as the swing's own
// effect — it renders as ONE typed term inside the ONE consolidated swing row,
// not a second roll event (#1822/#1823 regression fix) — so this drives the
// swing through the rail's own "Done" before reading the log: nothing persists
// until that commit fires (#1831).
test("damage riders: attuned Flame Tongue adds a typed +2d6 fire term to its attack", async ({ page }) => {
  // Deterministic dice (face = 1 + floor(0.5 * faces) → d20 always 11) keeps
  // the swing an ordinary hit — no die-locked crit/miss branch to juggle.
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
  await enterLiveCombat(page);
  await expect(page).toHaveURL(/[?&]tab=combat/);

  await page.getByRole("button", { name: /Start combat/i }).click();
  await page.getByRole("button", { name: "Start my turn" }).click();
  await page.getByRole("button", { name: /Use Action/ }).click();
  await page.getByRole("button", { name: "Attack", exact: true }).click();

  const attackSheet = page.getByRole("dialog");

  // The Damage step's on-hit riders are inert until the first Roll to hit
  // binds the rail to the selected form — the default is the equipped Flame
  // Tongue (#786).
  await attackSheet.getByRole("button", { name: "Roll to hit" }).click();

  // The bound rail exposes a typed on-hit rider button; rolling it stages a
  // fire term into the swing (merged into the ONE commit, not logged on its
  // own — #1843).
  const rider = attackSheet.getByRole("button", { name: /Roll \+2d6 fire/ });
  await expect(rider).toBeVisible();
  await rider.click();

  // Resolve the swing's own effect (implicit hit) and commit the ONE
  // resolveAction event for it.
  await attackSheet.getByRole("button", { name: "Roll damage", exact: true }).click();
  const done = attackSheet.getByRole("button", { name: /^Done$/ });
  // Two-step dismiss (#1832 review): the rail's own "Done" (ResolutionRail's
  // CompleteButton) commits the swing but doesn't close the sheet. With no
  // attacks left afterward, AttackSheetFooter's button relabels from "Close"
  // to "Done" (same onClose handler it always had — only the label is
  // conditional) — the SAME accessible name, so re-resolving this locator and
  // clicking again hits that footer button and actually dismisses the dialog.
  await done.click();
  await done.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // The rider lands in the SAME consolidated swing row as the main effect —
  // opened on demand from the one-line log row (#1086; the always-visible rail
  // is gone).
  await page.getByRole("button", { name: /open session log/i }).click();
  const logDrawer = page.getByRole("dialog", { name: "Session Log" });
  // One consolidated swing row carries BOTH damage terms in a single sentence
  // (#1843) — sessionLogFeed.ts's effectTailSegments format: "<source> — hit
  // for <total> slashing + <riderTotal> fire." — pinned exactly, not just
  // "fire" appearing anywhere.
  await expect(logDrawer.getByText(/hit for \d+ slashing \+ \d+ fire/).first()).toBeVisible();
  // No orphaned second roll-log row for the rider or the swing itself
  // (#1822/#1823 regression fix) — the only other "Rolled " line in this log
  // is the legitimate "Rolled Initiative" entry from starting combat
  // (buildAbilityRollRow), which this excludes rather than a bare "Rolled ".
  await expect(logDrawer.getByText(/^Rolled (?!Initiative)/)).toHaveCount(0);

  expect(errors).toEqual([]);
});
