import { Router } from "express";

import { ABILITY_REGISTRY } from "@/lib/classes/ability-registry.js";
import { runTransaction } from "@/lib/http/transactions-endpoint.js";

export const abilitiesRouter = Router({ mergeParams: true });

/**
 * POST /api/characters/:id/abilities/:abilityKey/transactions
 * The one transaction endpoint for every automated class/subclass ability: it
 * resolves `abilityKey` in ABILITY_REGISTRY and runs that handler's schema /
 * apply / domain errors / respond. Body and response shapes are the ability's
 * own — this layer adds only dispatch.
 *
 * The key is resolved BEFORE assertCharacterAccess, so an unknown key on another
 * owner's sheet 404s rather than 403s. That matches what an unknown URL already
 * did (the /api catch-all 404s with no access check) and ability keys aren't secret.
 */
abilitiesRouter.post<{ id: string; abilityKey: string }>("/:abilityKey/transactions", (req, res) => {
  const handler = ABILITY_REGISTRY[req.params.abilityKey];
  if (!handler) {
    res.status(404).json({ error: "Unknown ability" });
    return;
  }
  return runTransaction(handler, req, res);
});
