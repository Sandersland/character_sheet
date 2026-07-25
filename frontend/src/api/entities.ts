import type {
  CampaignEntity,
  CampaignEntityMerge,
  CodexActivityItem,
  EntityBacklink,
  EntityConnection,
  EntityType,
  EntityVisibility,
} from "@/types/character";
import { jsonBody, request, send } from "@/api/http";

// Campaign entities & @-tagging (#248). Plain REST. Search/list is campaign-scoped;
// create/edit are any-member; delete is OWNER-only (server-enforced). Backlinks come
// pre-filtered server-side to the caller's own notes plus other members' CAMPAIGN-
// shared ones (#838), so no client-side visibility logic is needed.

export async function fetchEntities(
  campaignId: string,
  opts?: { q?: string; type?: EntityType; includeStats?: boolean },
): Promise<CampaignEntity[]> {
  const params = new URLSearchParams();
  if (opts?.q) params.set("q", opts.q);
  if (opts?.type) params.set("type", opts.type);
  if (opts?.includeStats) params.set("include", "stats");
  const query = params.toString() ? `?${params.toString()}` : "";
  return request<CampaignEntity[]>(
    `/campaigns/${campaignId}/entities${query}`,
    undefined,
    "Failed to fetch entities",
  );
}

export async function createEntity(
  campaignId: string,
  input: {
    type: EntityType;
    name: string;
    aliases?: string[];
    notes?: string;
    portraitUrl?: string | null;
    visibility?: EntityVisibility;
  },
): Promise<CampaignEntity> {
  return request<CampaignEntity>(
    `/campaigns/${campaignId}/entities`,
    jsonBody(input),
    "Failed to create entity",
  );
}

export async function updateEntity(
  campaignId: string,
  entityId: string,
  patch: {
    type?: EntityType;
    name?: string;
    aliases?: string[];
    notes?: string | null;
    portraitUrl?: string | null;
    visibility?: EntityVisibility;
  },
): Promise<CampaignEntity> {
  return request<CampaignEntity>(
    `/campaigns/${campaignId}/entities/${entityId}`,
    jsonBody(patch, "PATCH"),
    "Failed to update entity",
  );
}

export async function deleteEntity(campaignId: string, entityId: string): Promise<void> {
  await send(
    `/campaigns/${campaignId}/entities/${entityId}`,
    { method: "DELETE" },
    "Failed to delete entity",
  );
}

export async function fetchEntityBacklinks(
  campaignId: string,
  entityId: string,
): Promise<EntityBacklink[]> {
  return request<EntityBacklink[]>(
    `/campaigns/${campaignId}/entities/${entityId}/backlinks`,
    undefined,
    "Failed to fetch entity backlinks",
  );
}

export async function fetchEntityConnections(
  campaignId: string,
  entityId: string,
  opts?: { limit?: number },
): Promise<EntityConnection[]> {
  const query = opts?.limit ? `?limit=${opts.limit}` : "";
  return request<EntityConnection[]>(
    `/campaigns/${campaignId}/entities/${entityId}/connections${query}`,
    undefined,
    "Failed to fetch entity connections",
  );
}

export async function fetchEntityActivity(
  campaignId: string,
  opts?: { limit?: number },
): Promise<CodexActivityItem[]> {
  const query = opts?.limit ? `?limit=${opts.limit}` : "";
  return request<CodexActivityItem[]>(
    `/campaigns/${campaignId}/entities/activity${query}`,
    undefined,
    "Failed to fetch codex activity",
  );
}

// Entity identity merges (#387). Owner-only writes (prepare/execute/unmerge). The
// list is scrubbed server-side: a non-owner only ever receives EXECUTED merges
// between revealed identities.

export async function fetchEntityMerges(campaignId: string): Promise<CampaignEntityMerge[]> {
  return request<CampaignEntityMerge[]>(
    `/campaigns/${campaignId}/entities/merges`,
    undefined,
    "Failed to fetch entity merges",
  );
}

export async function prepareEntityMerge(
  campaignId: string,
  input: { mergedEntityId: string; survivorEntityId: string; note?: string },
): Promise<CampaignEntityMerge> {
  return request<CampaignEntityMerge>(
    `/campaigns/${campaignId}/entities/merges`,
    jsonBody(input),
    "Failed to prepare merge",
  );
}

export async function executeEntityMerge(
  campaignId: string,
  mergeId: string,
): Promise<CampaignEntityMerge> {
  return request<CampaignEntityMerge>(
    `/campaigns/${campaignId}/entities/merges/${mergeId}/execute`,
    { method: "POST" },
    "Failed to execute merge",
  );
}

export async function unmergeEntityMerge(campaignId: string, mergeId: string): Promise<void> {
  await send(
    `/campaigns/${campaignId}/entities/merges/${mergeId}`,
    { method: "DELETE" },
    "Failed to unmerge",
  );
}
