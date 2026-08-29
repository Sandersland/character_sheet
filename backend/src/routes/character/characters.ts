import { randomUUID } from "node:crypto";

import { Router } from "express";

import { Prisma } from "@/generated/prisma/client.js";
import { logEvent } from "@/lib/activity/events.js";
import { prisma } from "@/lib/core/prisma.js";
import { createCharacter } from "@/lib/character/create/index.js";
import { characterInclude } from "@/lib/character/character-include.js";
import { serializeCharacter, serializeCharacterSummary } from "@/lib/character/character-serialize.js";
import {
  campaignPreferencesSchema,
  createCharacterSchema,
  updateCharacterSchema,
} from "@/lib/character/character-schemas.js";
import { assertCharacterAccess } from "@/lib/auth/access.js";
import { storedPortraitKey } from "@/lib/character/character-portrait.js";
import { lockCharacterRow } from "@/lib/character/character-transaction.js";
import { deletePortraitBlobBestEffort } from "@/lib/storage/portrait-blob.js";
import { validateAbilityScores } from "@/lib/srd/ability-generation.js";

export const charactersRouter = Router();

charactersRouter.get("/characters", async (req, res) => {
  const characters = await prisma.character.findMany({
    where: { ownerId: req.user!.id },
    select: {
      id: true,
      name: true,
      ownerId: true,
      campaignId: true,
      portraitKey: true,
      experiencePoints: true,
      raceSelection: { select: { name: true } },
      classEntries: { select: { name: true, level: true }, orderBy: { position: "asc" } },
    },
    orderBy: { name: "asc" },
  });

  res.json(characters.map(serializeCharacterSummary));
});

charactersRouter.get("/characters/:id", async (req, res) => {
  await assertCharacterAccess(prisma, req.user!.id, req.params.id, "view");

  const character = await prisma.character.findUniqueOrThrow({
    where: { id: req.params.id },
    include: characterInclude,
  });

  res.json(await serializeCharacter(character));
});

charactersRouter.post("/characters", async (req, res) => {
  const parseResult = createCharacterSchema.safeParse(req.body);

  if (!parseResult.success) {
    res
      .status(400)
      .json({ error: "Invalid request body", details: parseResult.error.flatten() });
    return;
  }

  // The creating user owns the character (requireAuth guarantees req.user).
  const result = await createCharacter(parseResult.data, req.user!.id);
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }

  const character = await prisma.character.findUniqueOrThrow({
    where: { id: result.id },
    include: characterInclude,
  });
  res.status(201).json(await serializeCharacter(character));
});

// e.g. "Currency adjusted (+5 gp, −2 sp)", or bare "Currency adjusted" when no denomination changed.
export function currencyAdjustSummary(
  oldCurrency: Record<string, number>,
  newCurrency: Record<string, number>,
): string {
  const parts: string[] = [];
  for (const denom of ["pp", "gp", "sp", "cp"] as const) {
    const diff = (newCurrency[denom] ?? 0) - (oldCurrency[denom] ?? 0);
    if (diff !== 0) parts.push(`${diff > 0 ? "+" : ""}${diff} ${denom}`);
  }
  return parts.length > 0 ? `Currency adjusted (${parts.join(", ")})` : "Currency adjusted";
}

charactersRouter.patch("/characters/:id", async (req, res) => {
  const parseResult = updateCharacterSchema.safeParse(req.body);

  if (!parseResult.success) {
    res
      .status(400)
      .json({ error: "Invalid request body", details: parseResult.error.flatten() });
    return;
  }

  // PATCH declares no generation method — the omitted-method (sanity-bound)
  // branch is exactly right here, the same rule createCharacter's own
  // omitted-method case applies. Runs before any DB access.
  if (parseResult.data.abilityScores) {
    const scoresResult = validateAbilityScores(undefined, parseResult.data.abilityScores);
    if (!scoresResult.ok) {
      res.status(400).json({ error: scoresResult.error });
      return;
    }
  }

  await assertCharacterAccess(prisma, req.user!.id, req.params.id, "edit");

  const patchData = parseResult.data as Prisma.CharacterUpdateInput;

  // Locked read-modify-write: the currency branch reads `currency` to compute
  // the event's `before`, so it must run after lockCharacterRow, inside the
  // same transaction as the write — otherwise two concurrent currency
  // PATCHes both read the pre-update currency and emit currencyAdjust events
  // with the same stale `before`, and LIFO undo double-reverts (#1978).
  const updated = await prisma.$transaction(
    async (tx) => {
      await lockCharacterRow(tx, req.params.id);

      const existing = await tx.character.findUniqueOrThrow({
        where: { id: req.params.id },
        select: { id: true, currency: true },
      });

      const result = await tx.character.update({
        where: { id: req.params.id },
        data: patchData,
        include: characterInclude,
      });

      // Logs a currencyAdjust event only when currency changed, so DM-handed-over amounts show in the timeline.
      if (parseResult.data.currency) {
        const oldCurrency = existing.currency as Record<string, number>;
        const newCurrency = parseResult.data.currency as Record<string, number>;
        const summary = currencyAdjustSummary(oldCurrency, newCurrency);

        await logEvent(tx, {
          characterId: req.params.id,
          category: "currency",
          type: "currencyAdjust",
          summary,
          before: { currency: oldCurrency },
          after: { currency: newCurrency },
          batchId: randomUUID(),
        });
      }

      return result;
    },
    // Generous timeout: the row lock above means real contention (a queued concurrent PATCH)
    // waits out the whole batch ahead of it, mirroring runCharacterTransaction's precedent.
    { timeout: 30_000 },
  );

  res.json(await serializeCharacter(updated));
});

// No audit event: cosmetic play settings, not a domain mutation.
charactersRouter.patch("/characters/:id/campaign-preferences", async (req, res) => {
  const parseResult = campaignPreferencesSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: "Invalid request body", details: parseResult.error.flatten() });
    return;
  }

  await assertCharacterAccess(prisma, req.user!.id, req.params.id, "edit");

  const existing = await prisma.character.findUniqueOrThrow({
    where: { id: req.params.id },
    select: { campaignId: true },
  });
  if (existing.campaignId == null) {
    res.status(400).json({ error: "Character is not attached to a campaign" });
    return;
  }

  const patch = parseResult.data;
  await prisma.campaignCharacterPreference.upsert({
    where: {
      campaignId_characterId: { campaignId: existing.campaignId, characterId: req.params.id },
    },
    create: { campaignId: existing.campaignId, characterId: req.params.id, ...patch },
    update: patch,
  });

  const character = await prisma.character.findUniqueOrThrow({
    where: { id: req.params.id },
    include: characterInclude,
  });
  res.json(await serializeCharacter(character));
});

charactersRouter.delete("/characters/:id", async (req, res) => {
  await assertCharacterAccess(prisma, req.user!.id, req.params.id, "edit");

  const portraitKey = await storedPortraitKey(req.params.id);
  // Every child relation is onDelete: Cascade in the schema, so this single delete is fully atomic.
  await prisma.character.delete({ where: { id: req.params.id } });
  // After the row delete: the blob store isn't part of the DB transaction, so a failure here only orphans a blob, never leaves a half-deleted character.
  await deletePortraitBlobBestEffort(portraitKey);
  res.status(204).end();
});
