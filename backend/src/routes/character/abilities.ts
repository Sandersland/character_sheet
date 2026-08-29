import { Router } from "express";

import { ABILITY_REGISTRY } from "@/lib/classes/ability-registry.js";
import { runTransaction } from "@/lib/http/transactions-endpoint.js";

export const abilitiesRouter = Router({ mergeParams: true });

/**
 * POST /api/characters/:id/abilities/:abilityKey/transactions
 * The key is resolved before assertCharacterAccess, so an unknown key on another owner's sheet 404s rather than 403s.
 */
abilitiesRouter.post<{ id: string; abilityKey: string }>("/:abilityKey/transactions", (req, res) => {
  const handler = ABILITY_REGISTRY[req.params.abilityKey];
  if (!handler) {
    res.status(404).json({ error: "Unknown ability" });
    return;
  }
  return runTransaction(handler, req, res);
});
