import { randomUUID } from "node:crypto";

import { Router } from "express";

import { assertCharacterAccess } from "@/lib/auth/access.js";
import { NotFoundError } from "@/lib/auth/errors.js";
import { characterInclude } from "@/lib/character/character-include.js";
import {
  deletePortraitBlobBestEffort,
  storedPortraitKey,
} from "@/lib/character/character-portrait.js";
import { serializeCharacter } from "@/lib/character/character-serialize.js";
import { prisma } from "@/lib/core/prisma.js";
import { BlobNotFoundError, createBlobStore, type BlobObject } from "@/lib/storage/index.js";
import { PORTRAIT_FIELD, portraitMultipart, sendPortrait } from "@/lib/storage/portrait-http.js";
import { PORTRAIT_CONTENT_TYPE, reencodePortrait } from "@/lib/storage/portrait-image.js";

/**
 * Character portrait pipeline (#1615): upload (multipart re-encode → blob
 * store → portraitKey), serve (streamed with the immutable cache contract),
 * delete. POST and DELETE return the full serialized character, same as every
 * other character mutation. Dedicated REST endpoints rather than a
 * transaction op because a multipart binary body cannot ride a JSON ops
 * array, and — like the cosmetic PATCH fields the portrait used to be one of
 * — no audit events are written.
 */
export const portraitRouter = Router({ mergeParams: true });

// Authorization runs BEFORE portraitMultipart so a non-owner can never make
// the server buffer a multi-megabyte body.
portraitRouter.post<{ id: string }>(
  "/",
  async (req, _res, next) => {
    await assertCharacterAccess(prisma, req.user!.id, req.params.id, "edit");
    next();
  },
  portraitMultipart,
  async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: `Missing multipart file field "${PORTRAIT_FIELD}"` });
      return;
    }

    const characterId = req.params.id;
    const webp = await reencodePortrait(req.file.buffer, req.file.mimetype);
    // A fresh uuid per upload is what versions the wire URL (derivePortraitUrl
    // reads it back as ?v=), making the immutable cache header safe.
    const key = `portraits/characters/${characterId}/${randomUUID()}.webp`;
    await createBlobStore().put(key, webp, { contentType: PORTRAIT_CONTENT_TYPE });

    // Blob first, then the key swap, then old-blob cleanup: a crash between
    // steps leaves at worst an orphaned blob, never a key pointing nowhere.
    // Concurrent uploads race benignly (last write wins; one blob may orphan).
    const previousKey = await storedPortraitKey(characterId);
    const updated = await prisma.character.update({
      where: { id: characterId },
      data: { portraitKey: key },
      include: characterInclude,
    });
    await deletePortraitBlobBestEffort(previousKey);

    res.json(serializeCharacter(updated));
  },
);

portraitRouter.get<{ id: string }>("/", async (req, res) => {
  await assertCharacterAccess(prisma, req.user!.id, req.params.id, "view");

  const portraitKey = await storedPortraitKey(req.params.id);
  if (!portraitKey) throw new NotFoundError("Portrait not found");

  let blob: BlobObject;
  try {
    blob = await createBlobStore().get(portraitKey);
  } catch (error) {
    // A stored key whose blob is gone (e.g. wiped fs dir) reads as no
    // portrait, not a server fault.
    if (error instanceof BlobNotFoundError) throw new NotFoundError("Portrait not found");
    throw error;
  }
  sendPortrait(res, blob);
});

// Idempotent: deleting an absent portrait is a no-op 200 — the response is
// the serialized character either way.
portraitRouter.delete<{ id: string }>("/", async (req, res) => {
  await assertCharacterAccess(prisma, req.user!.id, req.params.id, "edit");

  const portraitKey = await storedPortraitKey(req.params.id);
  const updated = await prisma.character.update({
    where: { id: req.params.id },
    data: { portraitKey: null },
    include: characterInclude,
  });
  await deletePortraitBlobBestEffort(portraitKey);

  res.json(serializeCharacter(updated));
});
