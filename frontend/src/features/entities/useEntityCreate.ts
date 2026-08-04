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

/**
 * Create-panel submission flow (#840, #1617): create the entity, prime the
 * shared cache, then upload the deferred portrait File (the entity id doesn't
 * exist until createEntity resolves). A failed upload flips the panel into
 * retry state — `createdEntity` set, submit re-runs ONLY the upload — because
 * the create itself already stuck and must never run twice.
 */
export function useEntityCreate(campaignId: string, isOwner: boolean, onClose: () => void) {
  const { entities } = useCampaignEntities(campaignId);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [portraitFile, setPortraitFile] = useState<File | null>(null);
  const [createdEntity, setCreatedEntity] = useState<CampaignEntity | null>(null);

  // Uploads the staged portrait for an already-created entity, closing on
  // success (or when nothing is staged). Failures are caught here — not
  // rethrown — so they read as retry state, never as a failed create.
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
