/**
 * Holds the currently-open inline resolution tool within the TurnHub.
 *
 * When a player picks an action (Attack, Cast a Spell, Second Wind, etc.),
 * the TurnHub calls `openResolution(key)` to set the active resolver.
 * The hub renders the appropriate inline tool (InlineAttackPicker,
 * InlineItemPicker, etc.) based on `resolver.kind`. When the player
 * finishes (all attacks rolled, spell cast, heal resolved), the tool calls
 * `closeResolution()` to clear the active state.
 *
 * This centralizes what were three separate show*Menu booleans and the fragile
 * cross-component onAttackRolled callback prop on the Attacks Card.
 */

import { useState, useCallback } from "react";
import { resolverFor, type ActionResolver } from "@/features/session/actionResolvers";
import type { AvailableAction } from "@/types/character";

/** Optional payload carried into the resolution sheet (pre-selection etc.). */
export interface ResolutionContext {
  /** Focus the spell picker on this spellbook entry (bonus-spell cards). */
  spellId?: string;
}

export interface ActiveResolution {
  resolver: ActionResolver;
  context?: ResolutionContext;
}

export interface ActiveResolutionState {
  /** The currently-open resolution, or null if no action is in progress. */
  activeResolution: ActiveResolution | null;
  /**
   * Open the inline tool for the given action key. No-ops if the key is
   * unrecognized (simple-confirm actions don't use an inline tool, but
   * callers may still call this — it's filtered in TurnHub logic). `action`
   * is optional context threaded to `resolverFor` (#1528's row-driven
   * fallback, #1676's fix) — every static-key caller here (attack/twf/
   * flurryOfBlows/castSpellBonus) omits it since those resolve from the
   * keyed ACTION_RESOLVERS table alone; a row-driven kind that needs an open
   * sheet (Song of Defense's "slot-picker", the first of its shape) can only
   * synthesize its resolver from the served AvailableAction, so the generic
   * `handleActionClick` path must pass it.
   */
  openResolution: (key: string, context?: ResolutionContext, action?: AvailableAction) => void;
  /** Clear the active resolution (tool dismissed or completed). */
  closeResolution: () => void;
}

export function useActiveResolution(): ActiveResolutionState {
  const [activeResolution, setActiveResolution] = useState<ActiveResolution | null>(null);

  const openResolution = useCallback((key: string, context?: ResolutionContext, action?: AvailableAction) => {
    const resolver = resolverFor(key, action);
    if (!resolver) return;
    setActiveResolution(context ? { resolver, context } : { resolver });
  }, []);

  const closeResolution = useCallback(() => {
    setActiveResolution(null);
  }, []);

  return { activeResolution, openResolution, closeResolution };
}
