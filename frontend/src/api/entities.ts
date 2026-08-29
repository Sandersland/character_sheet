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
    visibility?: EntityVisibility;
  },
): Promise<CampaignEntity> {
  return request<CampaignEntity>(
    `/campaigns/${campaignId}/entities/${entityId}`,
    jsonBody(patch, "PATCH"),
    "Failed to update entity",
  );
}

// Same contract as uploadCharacterPortrait: no Content-Type header (the
// browser must generate the multipart boundary), and the returned entity's
// portraitUrl carries a fresh ?v= version so a cached <img> refetches.
export async function uploadEntityPortrait(
  campaignId: string,
  entityId: string,
  file: File,
): Promise<CampaignEntity> {
  const form = new FormData();
  form.append("portrait", file);
  return request<CampaignEntity>(
    `/campaigns/${campaignId}/entities/${entityId}/portrait`,
    { method: "POST", body: form },
    "Failed to upload the portrait",
  );
}

// Idempotent; the returned entity has portraitUrl null.
export async function deleteEntityPortrait(
  campaignId: string,
  entityId: string,
): Promise<CampaignEntity> {
  return request<CampaignEntity>(
    `/campaigns/${campaignId}/entities/${entityId}/portrait`,
    { method: "DELETE" },
    "Failed to remove the portrait",
  );
}

export async function deleteEntity(campaignId: string, entityId: string): Promise<void> {
  await send(
    `/campaigns/${campaignId}/entities/${entityId}`,
    { method: "DELETE" },
    "Failed to delete entity",
  );
}

// Backlinks come pre-filtered server-side to the caller's own notes plus
// other members' CAMPAIGN-shared ones — no client-side visibility filtering
// needed.
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

// The list is scrubbed server-side: a non-owner only ever receives EXECUTED
// merges between revealed identities.
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

// Atomic and all-or-nothing: absorbs every `loserEntityIds` duplicate into
// `survivorEntityId` and deletes them, or leaves every entity untouched.
// Owner-only server-side; no undo.
export async function combineEntities(
  campaignId: string,
  survivorEntityId: string,
  loserEntityIds: string[],
): Promise<CampaignEntity> {
  return request<CampaignEntity>(
    `/campaigns/${campaignId}/entities/combine`,
    jsonBody({ survivorEntityId, loserEntityIds }),
    "Failed to combine entities",
  );
}
