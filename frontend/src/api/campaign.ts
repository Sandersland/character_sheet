import type { RulesEdition } from "@character-sheet/shared-types";

import type { Campaign, CampaignItem, CampaignItemHolder, CampaignItemInput, Character } from "@/types/character";
import { jsonBody, request, send } from "@/api/http";

export async function fetchCampaigns(): Promise<Campaign[]> {
  return request<Campaign[]>("/campaigns", undefined, "Failed to fetch campaigns");
}

// rulesEdition is the DM's picker at creation — the default new characters
// inherit; never authoritative for an existing sheet afterward.
export async function createCampaign(name: string, rulesEdition: RulesEdition): Promise<Campaign> {
  return request<Campaign>("/campaigns", jsonBody({ name, rulesEdition }), "Failed to create campaign");
}

export async function fetchCampaign(id: string): Promise<Campaign> {
  return request<Campaign>(`/campaigns/${id}`, undefined, `Failed to fetch campaign ${id}`);
}

export async function joinCampaign(inviteCode: string): Promise<Campaign> {
  return request<Campaign>("/campaigns/join", jsonBody({ inviteCode }), "Failed to join campaign");
}

// Owner-only. Characters survive server-side (detached); everything else in the
// campaign is deleted. 409s while a session is active.
export async function deleteCampaign(campaignId: string): Promise<void> {
  await send(`/campaigns/${campaignId}`, { method: "DELETE" }, "Failed to delete campaign");
}

export async function addCharacterToCampaign(
  characterId: string,
  campaignId: string,
): Promise<Character> {
  return request<Character>(
    `/campaigns/${campaignId}/characters`,
    jsonBody({ characterId }),
    "Failed to add character to campaign",
  );
}

export async function fetchCampaignItems(campaignId: string): Promise<CampaignItem[]> {
  return request<CampaignItem[]>(`/campaigns/${campaignId}/items`, undefined, "Failed to fetch campaign items");
}

// The member-readable Codex read, keyed by the fronting entity — non-owners
// get it only when the entity is revealed, and never see dmNotes (scrubbed
// server-side).
export async function fetchCampaignItemByEntity(
  campaignId: string,
  entityId: string,
): Promise<CampaignItem> {
  return request<CampaignItem>(
    `/campaigns/${campaignId}/items/by-entity/${entityId}`,
    undefined,
    "Failed to fetch campaign item",
  );
}

export async function createCampaignItem(
  campaignId: string,
  input: CampaignItemInput,
): Promise<CampaignItem> {
  return request<CampaignItem>(
    `/campaigns/${campaignId}/items`,
    jsonBody(input),
    "Failed to create campaign item",
  );
}

export async function updateCampaignItem(
  campaignId: string,
  itemId: string,
  patch: Partial<CampaignItemInput>,
): Promise<CampaignItem> {
  return request<CampaignItem>(
    `/campaigns/${campaignId}/items/${itemId}`,
    jsonBody(patch, "PATCH"),
    "Failed to update campaign item",
  );
}

export async function deleteCampaignItem(campaignId: string, itemId: string): Promise<void> {
  await send(`/campaigns/${campaignId}/items/${itemId}`, { method: "DELETE" }, "Failed to delete campaign item");
}

// Owner-only: grants a campaign item into a member's inventory (reveals the
// entity, audits on the target) or removes the provenance-matched row. Both
// return the item's updated holder list.
export async function awardCampaignItem(
  campaignId: string,
  itemId: string,
  body: { characterId: string; quantity?: number; sessionId?: string },
): Promise<{ holders: CampaignItemHolder[] }> {
  return request<{ holders: CampaignItemHolder[] }>(
    `/campaigns/${campaignId}/items/${itemId}/award`,
    jsonBody(body),
    "Failed to award campaign item",
  );
}

export async function revokeCampaignItem(
  campaignId: string,
  itemId: string,
  body: { characterId: string },
): Promise<{ holders: CampaignItemHolder[] }> {
  return request<{ holders: CampaignItemHolder[] }>(
    `/campaigns/${campaignId}/items/${itemId}/revoke`,
    jsonBody(body),
    "Failed to revoke campaign item",
  );
}
