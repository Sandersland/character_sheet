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
  /** In-play rule text for no-server-effect reminder actions (e.g. Shadow Step). */
  reminder?: string;
}

// The action op is derived from the route zod schema in
// @character-sheet/contracts (#1390) — `import type` only, so zod never enters
// the client bundle. Sent as `{ operations: ActionOperation[] }` to
// POST /api/characters/:id/actions/transactions. Only the union alias forwards:
// ExecuteActionOperation has zero frontend call sites, and a forwarded-only
// name is a dead export under the fallow gate.
export type { ActionOperation } from "@character-sheet/contracts";
