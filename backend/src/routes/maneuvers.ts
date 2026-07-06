import { Router } from "express";
import { z } from "zod";

import { assertCharacterAccess } from "../lib/auth/access.js";
import {
  applyManeuverOperations,
  InvalidManeuverOperationError,
} from "../lib/maneuvers.js";
import { InvalidResourceOperationError } from "../lib/resources.js";
import { InvalidSpellcastingOperationError } from "../lib/ability-cost.js";
import { prisma } from "../lib/prisma.js";
import { characterInclude } from "../lib/character-include.js";
import { serializeCharacter } from "../lib/character-serialize.js";

export const maneuversRouter = Router();

// Feeds the resources section's "learn a maneuver" picker — same role as
// GET /api/spells for the spellbook. GrantedAbility rows (source "maneuver"),
// carrying the placement/action metadata the session UI routes on. Alphabetical.
maneuversRouter.get("/maneuvers", async (_req, res) => {
  const maneuvers = await prisma.grantedAbility.findMany({
    where: { source: "maneuver" },
    orderBy: { name: "asc" },
  });

  res.json(
    maneuvers.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      placement: row.placement,
      actionSlot: row.actionSlot,
      saveAbility: row.saveAbility,
    }))
  );
});

// ── POST /api/characters/:id/maneuvers/transactions ───────────────────────────
//
// Intent-bearing batch mutation for maneuvers — mirrors the disciplines endpoint.
// The one op today: castManeuver — spend one superiority die (server rolls it),
// log the cast with the announced DC, apply Rally temp HP. Returns the updated
// character plus per-op { roll, saveDc } so the client folds the die into the
// attack/damage total.

const castManeuverOpSchema = z.object({
  type: z.literal("castManeuver"),
  entryId: z.string().min(1),
});

const operationSchema = z.discriminatedUnion("type", [castManeuverOpSchema]);

const transactionsRequestSchema = z.object({
  operations: z.array(operationSchema).min(1),
});

maneuversRouter.post("/characters/:id/maneuvers/transactions", async (req, res) => {
  await assertCharacterAccess(prisma, req.user!.id, req.params.id, "edit");

  const parseResult = transactionsRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: "Invalid request body", details: parseResult.error.flatten() });
    return;
  }

  let results;
  try {
    results = await applyManeuverOperations(req.params.id, parseResult.data.operations);
  } catch (error) {
    if (
      error instanceof InvalidManeuverOperationError ||
      error instanceof InvalidResourceOperationError ||
      error instanceof InvalidSpellcastingOperationError
    ) {
      res.status(400).json({ error: error.message });
      return;
    }
    throw error;
  }

  const updated = await prisma.character.findUnique({
    where: { id: req.params.id },
    include: characterInclude,
  });
  res.json({ character: serializeCharacter(updated!), results });
});
