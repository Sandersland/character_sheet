import { Router } from "express";
import { z } from "zod";

import { makeTransactionsEndpoint } from "@/lib/http/transactions-endpoint.js";
import {
  applyResolveActionOperations,
  InvalidResolveActionOperationError,
  InvalidSpellcastingOperationError,
  resolveActionOperationSchema,
} from "@/lib/combat/resolve-action.js";

export const resolveActionRouter = Router({ mergeParams: true });

const transactionsRequestSchema = z.object({
  operations: z.array(resolveActionOperationSchema).min(1),
});

/**
 * POST /api/characters/:id/resolve-action/transactions
 *
 * Slice 2 of epic #1827 (unified combat action resolution): commits a
 * resolved weapon swing or spell cast as ONE undoable `resolveAction`
 * CharacterEvent. Mirrors POST /api/characters/:id/spellcasting/transactions
 * (`castSpell`) — validate ops, apply atomically, write the audit event,
 * return the updated character.
 *
 * The frontend does not call this endpoint yet — `useAttackRolls`/
 * `useSpellPicker` still commit through the pre-existing `logRoll`/
 * `castSpell` paths until the adapter slices (#1832/#1833) migrate them.
 */
makeTransactionsEndpoint({
  router: resolveActionRouter,
  schema: transactionsRequestSchema,
  apply: (characterId, data) => applyResolveActionOperations(characterId, data.operations),
  domainErrors: [InvalidResolveActionOperationError, InvalidSpellcastingOperationError],
});
