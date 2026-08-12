// Pure Cloak of Shadows view derivation — extracted from CloakOfShadowsSection
// (#1738) so its branching lives in one directly-tested unit rather than
// inflating the component's own complexity. Shared by both editions: a 2024
// Warrior of Shadow row costs 3 focus with a duration cap, a 2014 Way of
// Shadow row costs nothing with no cap — both shapes come entirely off the
// served "cloakOfShadows" availableActions row (reminder + enabled/
// disabledReason), never a hardcoded pool amount. No JSX.

import type { Character } from "@/types/character";

// Must match CLOAK_OF_SHADOWS_NAME (backend shadow-arts.ts) — the literal
// source string applyConditionInTx stamps on the invisible ConditionEntry it
// applies. Matching on source, not just key, keeps this view from claiming a
// DIFFERENT invisible source (e.g. the Invisibility spell) as an active Cloak.
const CLOAK_OF_SHADOWS_SOURCE = "Cloak of Shadows";

export interface CloakOfShadowsView {
  /** Served rule text — differs per edition, resolved server-side; undefined when the row omits it. */
  reminder: string | undefined;
  /** True when the character is invisible specifically FROM this cast (source-matched, not any invisible source). */
  isInvisible: boolean;
  /** Whether the activation button should be enabled (resource-gated for 2024, always true for 2014). */
  canActivate: boolean;
  /** Button title when disabled by cost — the server's own disabledReason text. */
  disabledTitle: string;
}

export function cloakOfShadowsView(character: Character): CloakOfShadowsView {
  const action = (character.availableActions ?? []).find((a) => a.key === "cloakOfShadows");
  const isInvisible = (character.conditions?.active ?? []).some(
    (c) => c.key === "invisible" && c.source === CLOAK_OF_SHADOWS_SOURCE,
  );
  return {
    reminder: action?.reminder,
    isInvisible,
    canActivate: action?.enabled ?? false,
    disabledTitle: action?.disabledReason ?? "Cannot activate",
  };
}
