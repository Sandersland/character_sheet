/**
 * Pure planner for TurnHub action-slot clicks. Maps a resolver + character to a
 * side-effect-free descriptor the useTurnActions hook interprets — keeps the
 * per-kind branching testable and out of the hook's dispatch closure.
 */

import type { ActionResolver } from "@/features/session/actionResolvers";
import type { Character } from "@/types/character";
import type { RollSpec } from "@/lib/dice";

export interface ActionClickPlan {
  /** Consume the clicked cost slot (spell-picker defers this to cast-time). */
  consumeSlot: boolean;
  /** Open the inline resolution tool for this action. */
  openResolution: boolean;
  /** How to fire applyActionTransactions: not at all, plain, or with a heal roll. */
  send: "none" | "plain" | "healRoll";
  /** For send:"healRoll" — the dice spec to roll and pass as the heal total. */
  healRoll?: RollSpec;
}

export function planActionClick(
  resolver: ActionResolver | undefined,
  character: Character,
): ActionClickPlan {
  if (!resolver) {
    return { consumeSlot: true, openResolution: false, send: "none" };
  }

  switch (resolver.kind) {
    // flurry-picker and the `twf` key dispatch via handleFlurryAction /
    // handleTwfAction, not this generic handleActionClick → planActionClick path
    // (both need extra wiring: enterFlurryMode / enterTwfMode). But
    // bonusUnarmedStrike (#1218) — a real DERIVED_ACTIONS entry with a
    // twf-picker resolver — DOES reach here; its consumeSlot:true is
    // special-cased in handleActionClick to open the bonusAttack counter
    // (enterTwfMode) rather than a flat consumeBonusAction. All share the
    // attack-picker plan shape, and the twf-picker/flurry-picker cases keep this
    // switch exhaustive over ResolutionKind (adding a future kind is a compile error).
    case "attack-picker":
    case "twf-picker":
    case "flurry-picker":
      return {
        consumeSlot: true,
        openResolution: true,
        send: resolver.serverEffect ? "plain" : "none",
      };

    case "heal-roll":
      // `healRoll` absent (#1528) — a server-rolled row-driven action (Second
      // Wind: effectModifierSource "classLevel", backend/effects.ts). Send
      // plain (no client roll); the server rolls, applies, and reports it
      // back via ExecuteActionResult for useTurnActions to surface.
      return resolver.healRoll
        ? {
            consumeSlot: true,
            openResolution: false,
            send: "healRoll",
            healRoll: resolver.healRoll(character),
          }
        : { consumeSlot: true, openResolution: false, send: "plain" };

    // Slot is committed by the picker on use/cast/heal, not on open (#765) —
    // closing the sheet without acting stays free, like the spell picker. The
    // loadout picker (#815) likewise owns the Action itself — a held-item swap
    // spends it, a free-hand draw/stow is free. slot-picker (#1676/#1687)
    // shares this shape: Song of Defense's reaction commits only once a slot
    // level is actually chosen and used, not on opening the sheet.
    case "heal-input":
    case "item-picker":
    case "spell-picker":
    case "loadout-picker":
    case "slot-picker":
      return { consumeSlot: false, openResolution: true, send: "none" };

    // A row-served "toggle" (#1686, e.g. Rage/End Rage) shares simple-confirm's
    // exact send shape — kept as its own case (not folded into
    // "simple-confirm") because it's the value resolverFromRow actually
    // receives off the wire, and a shared case keeps this switch's
    // exhaustiveness check honest about which kinds a future toggle row can
    // reach here through.
    case "simple-confirm":
    case "toggle":
      return {
        consumeSlot: true,
        openResolution: false,
        send: resolver.serverEffect ? "plain" : "none",
      };
  }
}
