/**
 * Action-economy transaction-op schema for
 * POST /api/characters/:id/actions/transactions (#1390). The route
 * value-imports this and runs `.parse()`; the frontend takes `ActionOperation`
 * from `z.infer` of the same schema.
 *
 * `actionKey` stays an unconstrained non-empty string rather than an enum: the
 * catalog of legal keys lives in `ACTION_CAST_FN`/`ACTION_EFFECT_FN` on the
 * backend, and `assertKnownActionKeys` rejects an unknown one with a 400 — a
 * key enum here would have to mirror those tables across the tier boundary.
 */
import { z } from "zod";

/**
 * Execute a named action from the Action catalog. The server resolves the key to
 * its effect list and applies every resulting op in one atomic transaction.
 */
export const executeActionOpSchema = z.object({
  type: z.literal("executeAction"),
  actionKey: z.string().min(1),
  /**
   * Client-supplied roll total (potion healing, Second Wind heal, etc.). The
   * server validates and records it; it does NOT re-roll.
   */
  roll: z.number().int().positive().optional(),
  /** Inventory item to consume (for "drink potion" / Use Object). */
  inventoryItemId: z.string().optional(),
});
export type ExecuteActionOperation = z.infer<typeof executeActionOpSchema>;

/**
 * The action-op union has exactly one member today; the alias is the name the
 * `{ operations }` envelope is typed against, so adding a second op widens this
 * instead of churning every call site.
 */
export type ActionOperation = ExecuteActionOperation;
