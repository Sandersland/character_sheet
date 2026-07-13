// Battle Master maneuvers behind a single 44px disclosure row (#811): the
// Precision/damage ManeuverPrompt halves and the attackOption rows (Commander's
// Strike) collapse when unused so the step card keeps its vertical room.
// Collapsed row reads "Battle Master maneuvers · d8 × 4"; expanding mounts the
// same components the two old cards hosted (#809 hosting rules unchanged).

import { useState } from "react";

import AttackOptionSection from "@/features/session/AttackOptionSection";
import ManeuverPrompt from "@/features/session/ManeuverPrompt";
import type { AttackEntryView } from "@/features/session/useAttackRolls";
import type { UseManeuverDieReturn } from "@/features/session/useManeuverDie";
import type { TurnState, TurnStateActions } from "@/features/session/useTurnState";
import type { Character } from "@/types/character";

interface ManeuversDisclosureProps {
  character: Character;
  turnState: TurnState & TurnStateActions;
  /** The bound (last-rolled) form's view — the prompts read its roll state. */
  view: AttackEntryView | null;
  attacksExhausted: boolean;
  die: UseManeuverDieReturn;
  onUpdate: (c: Character) => void;
}

export default function ManeuversDisclosure({
  character,
  turnState,
  view,
  attacksExhausted,
  die,
  onUpdate,
}: ManeuversDisclosureProps) {
  const [open, setOpen] = useState(false);
  const { pool, dieLabel } = die;
  if (!pool) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 w-full items-center justify-between gap-2 rounded-control border border-gold-200 bg-gold-50 px-3 text-left text-xs font-semibold text-gold-800 transition-colors hover:bg-gold-100"
      >
        <span>
          Battle Master maneuvers · {dieLabel} × {pool.remaining}
        </span>
        <span aria-hidden className="text-gold-800">
          {open ? "▾" : "▸"}
        </span>
      </button>
      {open && (
        <div className="flex flex-col gap-1.5">
          {view && (
            <ManeuverPrompt
              key={view.entry.id}
              section="attack"
              character={character}
              lastAttackRoll={view.lastAttackRoll}
              lastDamageRoll={view.lastDamageRoll}
              onRollsUpdated={view.onRollsUpdated}
              onUpdate={onUpdate}
            />
          )}
          {view && (
            <ManeuverPrompt
              key={`${view.entry.id}-damage`}
              section="damage"
              character={character}
              lastAttackRoll={view.lastAttackRoll}
              lastDamageRoll={view.lastDamageRoll}
              onRollsUpdated={view.onRollsUpdated}
              onUpdate={onUpdate}
            />
          )}
          <AttackOptionSection
            character={character}
            turnState={turnState}
            showManeuvers
            attacksExhausted={attacksExhausted}
            die={die}
          />
          {!view && (
            <p className="px-1 text-xs text-parchment-500">
              Roll to hit first — Precision and damage maneuvers attach to a roll.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
