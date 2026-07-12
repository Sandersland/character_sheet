// Unarmed Strike + Improvised Weapon rows — always available in the attack sheet,
// styled to the card language. Extracted from InlineAttackPicker (#778).

import { buildImprovisedEntry, buildUnarmedEntry } from "@/lib/attackMath";
import AttackRow from "@/features/session/AttackRow";
import type { AttackEntryView } from "@/features/session/useAttackRolls";
import type { AttackEntry } from "@/lib/attackMath";
import type { Character } from "@/types/character";

interface BasicAttackRowsProps {
  character: Character;
  viewFor: (entry: AttackEntry) => AttackEntryView;
  attacksExhausted: boolean;
  showManeuvers: boolean;
  riderTotals: Record<string, number>;
  onUpdate: (c: Character) => void;
}

export default function BasicAttackRows({
  character,
  viewFor,
  attacksExhausted,
  showManeuvers,
  riderTotals,
  onUpdate,
}: BasicAttackRowsProps) {
  const entries = [buildUnarmedEntry(character), buildImprovisedEntry(character)];
  return (
    <>
      {entries.map((entry) => (
        <div key={entry.id} className="rounded-card border border-parchment-200 bg-parchment-50 px-3">
          <AttackRow
            view={viewFor(entry)}
            attacksExhausted={attacksExhausted}
            showManeuvers={showManeuvers}
            character={character}
            riderTotals={riderTotals}
            onUpdate={onUpdate}
          />
        </div>
      ))}
    </>
  );
}
