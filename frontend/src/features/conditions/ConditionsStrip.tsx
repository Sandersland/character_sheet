/**
 * ConditionsStrip — the character's active status-condition chips plus an
 * exhaustion stepper and an inline "add condition" panel, in a Card shell. The
 * interactive innards (and the applyConditionTransactions / busy / error logic)
 * live in ConditionsSheetBody, shared with the mobile CompactConditionsBar sheet.
 *
 * On the character sheet it's mounted on the Combat tab; on the session page it's
 * the desktop (md+) form, with CompactConditionsBar taking mobile.
 */

import ConditionsSheetBody from "@/features/conditions/ConditionsSheetBody";
import type { Character } from "@/types/character";

interface Props {
  character: Character;
  onUpdate: (updated: Character) => void;
}

export default function ConditionsStrip({ character, onUpdate }: Props) {
  return (
    <section
      className="rounded-card border border-parchment-200 bg-parchment-50 p-4 shadow-card"
      aria-label="Conditions"
    >
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-parchment-600">
          Conditions
        </h2>
      </div>

      <ConditionsSheetBody character={character} onUpdate={onUpdate} />
    </section>
  );
}
