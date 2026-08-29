import type { Character } from "@/types/character";

// Must match backend CLOAK_OF_SHADOWS_NAME, the source string applyConditionInTx stamps on the invisible ConditionEntry — matching source, not just key, keeps this from claiming a different invisible source (e.g. Invisibility) as an active Cloak.
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
