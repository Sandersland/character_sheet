import { useState } from "react";

import { createEntity, uploadEntityPortrait } from "@/api/client";
import { primeCampaignEntities, useCampaignEntities } from "@/hooks/useCampaignEntities";
import type { CampaignEntity, EntityType } from "@/types/character";

interface EntityCreateInput {
  type: EntityType;
  name: string;
  aliases: string;
  notes: string;
  startHidden: boolean;
}

function buildCreatePayload(input: EntityCreateInput, isOwner: boolean) {
  return {
    type: input.type,
    name: input.name.trim(),
    aliases: input.aliases
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean),
    notes: input.notes.trim() === "" ? undefined : input.notes.trim(),
    // Only the owner may seed visibility; the backend gates it anyway.
    ...(isOwner && input.startHidden ? { visibility: "HIDDEN" as const } : {}),
  };
}

// A failed portrait upload flips into retry state (createdEntity set) so submit re-runs only the upload — the create already stuck and must never run twice.
export function useEntityCreate(campaignId: string, isOwner: boolean, onClose: () => void) {
  const { entities } = useCampaignEntities(campaignId);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [portraitFile, setPortraitFile] = useState<File | null>(null);
  const [createdEntity, setCreatedEntity] = useState<CampaignEntity | null>(null);

  // Failures are caught here, not rethrown, so they read as retry state rather than a failed create.
  async function uploadStagedPortrait(created: CampaignEntity) {
    if (!portraitFile) {
      onClose();
      return;
    }
    try {
      const updated = await uploadEntityPortrait(campaignId, created.id, portraitFile);
      primeCampaignEntities(campaignId, [...entities.filter((e) => e.id !== created.id), updated]);
      onClose();
    } catch (err) {
      setCreatedEntity(created);
      setFormError(
        err instanceof Error
          ? `The entry was created, but the portrait upload failed: ${err.message}`
          : "The entry was created, but the portrait upload failed.",
      );
    }
  }

  async function submit(input: EntityCreateInput) {
    setBusy(true);
    setFormError(null);
    try {
      if (createdEntity) {
        await uploadStagedPortrait(createdEntity);
        return;
      }
      const created = await createEntity(campaignId, buildCreatePayload(input, isOwner));
      // Prime the shared cache so the list and journal @-chips update at once.
      primeCampaignEntities(campaignId, [...entities, created]);
      await uploadStagedPortrait(created);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create entity.");
    } finally {
      setBusy(false);
    }
  }

  return { busy, formError, portraitFile, setPortraitFile, createdEntity, submit };
}
