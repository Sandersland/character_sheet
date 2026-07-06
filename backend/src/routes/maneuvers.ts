import { Router } from "express";
import { z } from "zod";

import {
  applyManeuverOperations,
  InvalidManeuverOperationError,
} from "../lib/maneuvers.js";
import { InvalidResourceOperationError } from "../lib/resources.js";
import { InvalidSpellcastingOperationError } from "../lib/ability-cost.js";
import { prisma } from "../lib/prisma.js";
import { makeTransactionsEndpoint } from "../lib/transactions-endpoint.js";

export const maneuversRouter = Router({ mergeParams: true });

// Feeds the resources section's "learn a maneuver" picker — same role as
// GET /api/spells for the spellbook. GrantedAbility rows (source "maneuver"),
// carrying the placement/action metadata the session UI routes on. Alphabetical.
maneuversRouter.get("/", async (_req, res) => {
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

makeTransactionsEndpoint({
  router: maneuversRouter,
  schema: transactionsRequestSchema,
  apply: (characterId, data) => applyManeuverOperations(characterId, data.operations),
  domainErrors: [
    InvalidManeuverOperationError,
    InvalidResourceOperationError,
    InvalidSpellcastingOperationError,
  ],
  respond: (character, results) => ({ character, results }),
});
