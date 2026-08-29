// Maps a resolver + character to a plan useTurnActions interprets, keeping the
// per-kind branching testable and out of the hook's dispatch closure.
import type { ActionResolver } from "@/features/session/actionResolvers";
import type { Character } from "@/types/character";
import type { RollSpec } from "@/lib/dice";

export interface ActionClickPlan {
  /** Consume the clicked cost slot (spell-picker defers this to cast-time). */
  consumeSlot: boolean;
  openResolution: boolean;
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
    // flurry-picker/twf-picker keep this switch exhaustive over ResolutionKind
    // (a future kind is a compile error) — Flurry/TWF actually dispatch via
    // handleFlurryAction/handleTwfAction, except bonusUnarmedStrike (#1218),
    // whose twf-picker resolver does reach here and is special-cased in
    // handleActionClick to open the bonusAttack counter (enterTwfMode).
    case "attack-picker":
    case "twf-picker":
    case "flurry-picker":
      return {
        consumeSlot: true,
        openResolution: true,
        send: resolver.serverEffect ? "plain" : "none",
      };

    case "heal-roll":
      // healRoll absent (#1528, e.g. Second Wind) means a server-rolled row
      // action — send plain and let ExecuteActionResult report the roll back
      // for useTurnActions to surface.
      return resolver.healRoll
        ? {
            consumeSlot: true,
            openResolution: false,
            send: "healRoll",
            healRoll: resolver.healRoll(character),
          }
        : { consumeSlot: true, openResolution: false, send: "plain" };

    // consumeSlot is false because the picker itself commits the cost on
    // use/cast/heal (#765), not on open — closing without acting stays free
    // (loadout #815, slot-picker #1676/#1687 share this shape).
    case "heal-input":
    case "item-picker":
    case "spell-picker":
    case "loadout-picker":
    case "slot-picker":
      return { consumeSlot: false, openResolution: true, send: "none" };

    // toggle (#1686, e.g. Rage) shares simple-confirm's send shape but stays a
    // separate case since resolverFromRow serves it as its own kind off the
    // wire, keeping this switch's exhaustiveness check honest.
    case "simple-confirm":
    case "toggle":
      return {
        consumeSlot: true,
        openResolution: false,
        send: resolver.serverEffect ? "plain" : "none",
      };
  }
}
