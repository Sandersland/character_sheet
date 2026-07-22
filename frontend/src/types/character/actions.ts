/**
 * Action-economy catalog types and the executeAction operation.
 */

/**
 * Action-economy cost — which slot an action consumes on the character's turn.
 * Mirrors the `ActionCost` enum on the backend Action model.
 */
export type ActionCost = "action" | "bonusAction" | "reaction" | "free" | "special";

/**
 * A lean "available action" entry attached to the serialized character.
 * Derived at read time by `deriveActions`.
 * Display copy (name/description) is joined from the `Action` catalog.
 * `enabled` cross-references remaining resource-pool counts so the frontend
 * can grey out abilities the character can't afford.
 */
export interface AvailableAction {
  /** Stable machine key matching `Action.key` in the catalog. */
  key: string;
  name: string;
  cost: ActionCost;
  /** False when the character can't currently use this action (e.g. no focus). */
  enabled: boolean;
  /** Human-readable reason why `enabled` is false; absent when enabled. */
  disabledReason?: string;
  /** In-play rule text for no-server-effect reminder actions (Shadow Step, Opportunist). */
  reminder?: string;
}

/**
 * Execute a named action from the Action catalog. The server looks up
 * ACTION_EFFECT_FN[key], emits the appropriate domain ops (spendResource,
 * adjustQuantity, heal, etc.) within a single atomic transaction, and returns
 * the updated character. Client-rolled values (potion heal, die roll totals)
 * are passed via `roll`.
 */
export interface ExecuteActionOperation {
  type: "executeAction";
  /** Matches `Action.key` in the catalog (e.g. "drinkPotion", "rage"). */
  actionKey: string;
  /** Target inventory item id for item-consuming actions (e.g. drinkPotion). */
  inventoryItemId?: string;
  /**
   * Client-rolled total for actions whose effects involve dice (e.g. a potion
   * heal). The server validates and records this; it does NOT re-roll.
   * Absent for actions with no die roll.
   */
  roll?: number;
}

/**
 * Action operation types — the executeAction op is resolved via `ACTION_EFFECT_FN`.
 * Sent as `{ operations: ActionOperation[] }` to
 * POST /api/characters/:id/actions/transactions.
 */
export type ActionOperation = ExecuteActionOperation;
