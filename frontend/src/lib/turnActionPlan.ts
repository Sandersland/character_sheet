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
    // twf-picker: the `twf` key itself still bypasses this plan (dispatches via
    // handleTwfAction, not generic handleActionClick). But bonusUnarmedStrike
    // (#1218) — a real DERIVED_ACTIONS entry — DOES reach here; its
    // consumeSlot:true is special-cased in handleActionClick to open the
    // bonusAttack counter (enterTwfMode) rather than a flat consumeBonusAction.
    // Shares the attack-picker plan shape either way.
    case "attack-picker":
    case "twf-picker":
      return {
        consumeSlot: true,
        openResolution: true,
        send: resolver.serverEffect ? "plain" : "none",
      };

    case "heal-roll":
      return resolver.healRoll
        ? {
            consumeSlot: true,
            openResolution: false,
            send: "healRoll",
            healRoll: resolver.healRoll(character),
          }
        : { consumeSlot: true, openResolution: false, send: "none" };

    // Slot is committed by the picker on use/cast/heal, not on open (#765) —
    // closing the sheet without acting stays free, like the spell picker. The
    // loadout picker (#815) likewise owns the Action itself — a held-item swap
    // spends it, a free-hand draw/stow is free.
    case "heal-input":
    case "item-picker":
    case "spell-picker":
    case "loadout-picker":
      return { consumeSlot: false, openResolution: true, send: "none" };

    case "simple-confirm":
      return {
        consumeSlot: true,
        openResolution: false,
        send: resolver.serverEffect ? "plain" : "none",
      };
  }
}
