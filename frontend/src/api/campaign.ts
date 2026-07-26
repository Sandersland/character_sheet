import type { Campaign, CampaignItem, CampaignItemHolder, CampaignItemInput, Character } from "@/types/character";
import { jsonBody, request, send } from "@/api/http";

// Campaigns (#246). Plain REST: list/create/join/attach. The attach call returns
// the full updated Character (same shape as every character-mutating endpoint).

export async function fetchCampaigns(): Promise<Campaign[]> {
  return request<Campaign[]>("/campaigns", undefined, "Failed to fetch campaigns");
}

export async function createCampaign(name: string): Promise<Campaign> {
  return request<Campaign>("/campaigns", jsonBody({ name }), "Failed to create campaign");
}

export async function fetchCampaign(id: string): Promise<Campaign> {
  return request<Campaign>(`/campaigns/${id}`, undefined, `Failed to fetch campaign ${id}`);
}

export async function joinCampaign(inviteCode: string): Promise<Campaign> {
  return request<Campaign>("/campaigns/join", jsonBody({ inviteCode }), "Failed to join campaign");
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

// Campaign items (#380). Owner-only CRUD (list/create/update/delete).
// fetchCampaignItemByEntity is the member-readable Codex read, keyed by the fronting
// entity — non-owners get it only when that entity is revealed, and never see
// dmNotes (scrubbed server-side).

export async function fetchCampaignItems(campaignId: string): Promise<CampaignItem[]> {
  return request<CampaignItem[]>(`/campaigns/${campaignId}/items`, undefined, "Failed to fetch campaign items");
}

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

// Award/revoke (#381): owner-only. Grants a campaign item into a member
// character's inventory (reveals the entity, audits on the target) or removes
// the provenance-matched row. Both return the item's updated holder list.
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
