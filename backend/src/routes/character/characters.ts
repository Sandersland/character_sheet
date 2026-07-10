import { randomUUID } from "node:crypto";

import { Router } from "express";

import { Prisma } from "@/generated/prisma/client.js";
import { logEvent } from "@/lib/activity/events.js";
import { prisma } from "@/lib/core/prisma.js";
import { createCharacter } from "@/lib/character/character-create.js";
import { characterInclude } from "@/lib/character/character-include.js";
import { serializeCharacter, serializeCharacterSummary } from "@/lib/character/character-serialize.js";
import {
  campaignPreferencesSchema,
  createCharacterSchema,
  updateCharacterSchema,
} from "@/lib/character/character-schemas.js";
import { assertCharacterAccess } from "@/lib/auth/access.js";

export const charactersRouter = Router();

// Owner-scoped listing: a caller only ever sees their own characters. The
// authenticated user is attached by requireAuth (app.ts).
charactersRouter.get("/characters", async (req, res) => {
  const characters = await prisma.character.findMany({
    where: { ownerId: req.user!.id },
    select: {
      id: true,
      name: true,
      ownerId: true,
      campaignId: true,
      portraitUrl: true,
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

  res.json(serializeCharacter(character));
});

// Thin controller: parse the HTTP contract, delegate domain work to
// createCharacter (lib/character/character-create.ts), then re-fetch + serialize with the
// same persist-then-reserialize idiom the mutation routes use.
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
  res.status(201).json(serializeCharacter(character));
});

charactersRouter.patch("/characters/:id", async (req, res) => {
  const parseResult = updateCharacterSchema.safeParse(req.body);

  if (!parseResult.success) {
    res
      .status(400)
      .json({ error: "Invalid request body", details: parseResult.error.flatten() });
    return;
  }

  await assertCharacterAccess(prisma, req.user!.id, req.params.id, "edit");

  const existing = await prisma.character.findUniqueOrThrow({
    where: { id: req.params.id },
    select: { id: true, currency: true },
  });

  // If currency is changing, log a currencyAdjust event in the same
  // transaction so the activity timeline records bare DM-handed-over amounts.
  let updated: Awaited<ReturnType<typeof prisma.character.findUnique>> & object;
  const patchData = parseResult.data as Prisma.CharacterUpdateInput;

  if (parseResult.data.currency) {
    const oldCurrency = existing.currency as Record<string, number>;
    const newCurrency = parseResult.data.currency as Record<string, number>;
    // Build a one-line delta summary, e.g. "+5 gp −2 sp"
    const parts: string[] = [];
    for (const denom of ["pp", "gp", "sp", "cp"] as const) {
      const diff = (newCurrency[denom] ?? 0) - (oldCurrency[denom] ?? 0);
      if (diff !== 0) parts.push(`${diff > 0 ? "+" : ""}${diff} ${denom}`);
    }
    const summary = parts.length > 0 ? `Currency adjusted (${parts.join(", ")})` : "Currency adjusted";

    updated = await prisma.$transaction(async (tx) => {
      const result = await tx.character.update({
        where: { id: req.params.id },
        data: patchData,
        include: characterInclude,
      });
      await logEvent(tx, {
        characterId: req.params.id,
        category: "currency",
        type: "currencyAdjust",
        summary,
        before: { currency: oldCurrency },
        after: { currency: newCurrency },
        batchId: randomUUID(),
      });
      return result;
    });
  } else {
    updated = await prisma.character.update({
      where: { id: req.params.id },
      data: patchData,
      include: characterInclude,
    }) as typeof updated;
  }

  res.json(serializeCharacter(updated as Parameters<typeof serializeCharacter>[0]));
});

// Campaign-scoped play preferences (#537). Thin owner-only upsert of the prefs
// row for (character, its current campaignId). No audit event / EventCategory —
// these are cosmetic play settings, not a domain mutation. 400 when the
// character isn't attached to a campaign (there's no scope to write to).
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
  res.json(serializeCharacter(character));
});

charactersRouter.delete("/characters/:id", async (req, res) => {
  await assertCharacterAccess(prisma, req.user!.id, req.params.id, "edit");

  // All child relations (CharacterRace, CharacterBackground, CharacterClassEntry,
  // InventoryItem, CharacterEvent/CharacterEventField, and their grandchildren)
  // are onDelete: Cascade in the schema, so a single delete is fully atomic.
  await prisma.character.delete({ where: { id: req.params.id } });
  res.status(204).end();
});
