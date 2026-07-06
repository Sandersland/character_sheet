import { expect, test } from "@playwright/test";

import { login } from "./helpers/auth";
import { collectConsoleErrors } from "./helpers/console";
import { uniqueName } from "./helpers/api";

// #523: the Codex is the single entity list. An owner creates an entity (hidden)
// from the Codex, reaches every admin action from the detail page
// (reveal/hide/delete), and the Manage tab keeps only Identity merges.

async function createCampaign(request: import("@playwright/test").APIRequestContext): Promise<string> {
  const response = await request.post("/api/campaigns", { data: { name: uniqueName("E2E Codex") } });
  expect(response.ok(), `create campaign: ${response.status()}`).toBeTruthy();
  const { id } = (await response.json()) as { id: string };
  return id;
}

test("owner creates a hidden entity from the Codex and reveals it from the detail page", async ({
  page,
}) => {
  await login(page);
  const errors = collectConsoleErrors(page);
  const campaignId = await createCampaign(page.request);
  const entityName = uniqueName("Big Bad");

  await page.goto(`/campaigns/${campaignId}/codex`);

  await page.getByRole("button", { name: /new entity/i }).click();
  await page.getByLabel("Name *").fill(entityName);
  await page.getByLabel(/start hidden from players/i).check();
  await page.getByRole("button", { name: /create entity/i }).click();

  // The new row shows in the Codex with an owner-only Hidden badge.
  const row = page.getByRole("link", { name: new RegExp(entityName) });
  await expect(row).toBeVisible();
  await expect(page.getByText("Hidden").first()).toBeVisible();

  // Open the detail page and reveal it.
  await row.click();
  await expect(page.getByRole("heading", { name: new RegExp(entityName) })).toBeVisible();
  await page.getByRole("button", { name: /reveal to players/i }).click();
  await expect(page.getByRole("button", { name: /hide from players/i })).toBeVisible();

  // Delete it, landing back on the campaign hub.
  await page.getByRole("button", { name: /delete entity/i }).click();
  await expect(page).toHaveURL(new RegExp(`/campaigns/${campaignId}$`));

  expect(errors).toEqual([]);
});

test("the Manage tab keeps Identity merges but lists no entities", async ({ page }) => {
  await login(page);
  const errors = collectConsoleErrors(page);
  const campaignId = await createCampaign(page.request);

  await page.goto(`/campaigns/${campaignId}/manage`);

  await expect(page.getByRole("heading", { name: /identity merges/i })).toBeVisible();
  await expect(page.getByRole("searchbox", { name: /search entities/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /new entity/i })).toHaveCount(0);

  expect(errors).toEqual([]);
});
