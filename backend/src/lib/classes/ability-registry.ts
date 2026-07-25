import { z } from "zod";

import type { TransactionHandler } from "@/lib/http/transactions-endpoint.js";
import { applySneakAttackOperations, InvalidSneakAttackOperationError } from "./sneak-attack.js";

// Every ability takes the same envelope — a non-empty batch of ops discriminated
// on `type` — so the entries below differ only in their op shapes.
function opBatch<Options extends readonly [z.ZodObject, ...z.ZodObject[]]>(...options: Options) {
  return z.object({ operations: z.array(z.discriminatedUnion("type", options)).min(1) });
}

// Erases each entry's <Schema, Result> pair so they can share one Record while
// `apply`/`respond` still see their own parsed types. No cast is needed because
// TransactionHandler declares those two as methods, which TS checks bivariantly.
function defineAbility<Schema extends z.ZodTypeAny, Result>(
  handler: TransactionHandler<Schema, Result>,
): TransactionHandler {
  return handler;
}

/**
 * Every class/subclass ability the sheet automates, keyed by URL segment for the
 * shared `POST /api/characters/:id/abilities/:abilityKey/transactions` endpoint
 * (#1275). Adding an automated feature is a rules module plus one entry here —
 * no route file, no app.ts mount, no new client export.
 *
 * Invariant: `abilityKey` is the basename of the ability's rules module in this
 * directory, so the URL names the file that implements it.
 *
 * Unrelated to `SUBCLASS_REGISTRY` and friends in this directory's `registry`
 * module, which dispatch class/subclass *derivation*, not HTTP transactions.
 */
export const ABILITY_REGISTRY: Record<string, TransactionHandler> = {
  "sneak-attack": defineAbility({
    schema: opBatch(z.object({
      type: z.literal("rollSneakAttack"),
      eligible: z.boolean(),
      usedThisTurn: z.boolean(),
    })),
    apply: (characterId, data) => applySneakAttackOperations(characterId, data.operations),
    domainErrors: [InvalidSneakAttackOperationError],
    respond: (character, results) => ({ character, results }),
  }),
};
