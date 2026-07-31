/**
 * Action-economy catalog types and the executeAction operation.
 */
import type { ExecuteActionResult } from "@character-sheet/shared-types";

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
  /**
   * Universal action keys this class feature re-costs rather than shadows
   * (#1431) — Cunning Action buys Dash/Disengage/Hide for a Bonus Action.
   * Resolved against `GET /api/reference`'s `universalActions` for the
   * character's edition: the client looks a key up and never knows what it
   * means, and never assumes a name, because one key serves two (Use an Object
   * in SRD 5.1, Utilize in SRD 5.2).
   */
  regrants?: string[];
  /**
   * Which inline resolution tool to render for this action (#1528) — served
   * only for a row-driven action (backend's actionsFromRows); a class still
   * on the DERIVED_ACTIONS/ACTION_RESOLVERS path leaves this undefined, and
   * `resolverFor` keeps reading its own keyed table for those. Values mirror
   * `ResolutionKind` (actionResolvers.ts) — the wire-served vocabulary a
   * ClassFeature row can name, retiring the frontend's per-key mirror one
   * row at a time (#1383).
   */
  resolverKind?: string;
}

// ExecuteActionResult (#1528) is defined in @character-sheet/shared-types —
// re-exported here so existing imports from "@/types/character" keep working.
// Was a hand-mirrored duplicate of the backend route's own copy (the exact
// #1369/#1370 failure mode), caught in review.
export type { ExecuteActionResult };

// The action op is derived from the route zod schema in
// @character-sheet/contracts (#1390) — `import type` only, so zod never enters
// the client bundle. Sent as `{ operations: ActionOperation[] }` to
// POST /api/characters/:id/actions/transactions. Only the union alias forwards:
// ExecuteActionOperation has zero frontend call sites, and a forwarded-only
// name is a dead export under the fallow gate.
export type { ActionOperation } from "@character-sheet/contracts";
