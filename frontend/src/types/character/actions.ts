import type { EffectSpec, ExecuteActionResult } from "@character-sheet/shared-types";

// Mirrors the `ActionCost` enum on the backend Action model.
export type ActionCost = "action" | "bonusAction" | "reaction" | "free" | "special";

/** Derived at read time by `deriveActions`. */
export interface AvailableAction {
  /** Stable machine key matching `Action.key` in the catalog. */
  key: string;
  name: string;
  cost: ActionCost;
  enabled: boolean;
  /** Absent when `enabled` is true. */
  disabledReason?: string;
  /** Rule text for actions the engine doesn't execute server-side. */
  reminder?: string;
  /** Keys resolve against `GET /api/reference`'s `universalActions` for the character's edition — never assume a display name. */
  regrants?: string[];
  /** Resolved verbatim server-side; never re-derive from level — see `flurryStrikeCount`. */
  count?: number;
  /** Resolved Deflect Attacks/Energy damage-type clause — see `deflectAttacksDamageTypeClause`. */
  damageTypeClause?: string;
  /** Mirrors `ResolutionKind`; undefined for actions still on the ACTION_RESOLVERS path. */
  resolverKind?: string;
  /** Resolved roll spec; client never re-derives monk-level/die math — see `deflectRollFromAction`. */
  effect?: EffectSpec;
}

export type { ExecuteActionResult };

// Sent as { operations: ActionOperation[] } to POST /api/characters/:id/actions/transactions.
export type { ActionOperation } from "@character-sheet/contracts";
