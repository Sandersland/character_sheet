import { Router } from "express";
import { z } from "zod";

import { makeTransactionsEndpoint } from "@/lib/http/transactions-endpoint.js";
import {
  applyResolveActionOperations,
  InvalidResolveActionOperationError,
  InvalidSpellcastingOperationError,
  resolveActionRequestOperationSchema,
} from "@/lib/combat/resolve-action.js";

export const resolveActionRouter = Router({ mergeParams: true });

const transactionsRequestSchema = z.object({
  operations: z.array(resolveActionRequestOperationSchema).min(1),
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
 * The weapon adapter (#1832, `frontend/src/api/combat.ts`) is the first
 * frontend caller — `InlineAttackPicker`'s weapon swings commit here now.
 * `useSpellPicker` still commits through the pre-existing `castSpell` path
 * until the spell adapter slice (#1833) migrates it.
 */
makeTransactionsEndpoint({
  router: resolveActionRouter,
  schema: transactionsRequestSchema,
  apply: (characterId, data, userId) => applyResolveActionOperations(characterId, data.operations, userId),
  domainErrors: [InvalidResolveActionOperationError, InvalidSpellcastingOperationError],
  // batchId rides beside the character for turn undo (#758); the client API layer splits it off.
  respond: (character, batchId) => ({ ...character, batchId }),
});
