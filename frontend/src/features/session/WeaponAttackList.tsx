// Equipped-weapon "Roll to hit" cards (deduped by name) plus the shared Damage
// card for the active weapon. Selecting a card — or rolling to hit — makes it the
// weapon the Damage card rolls for. Extracted from InlineAttackPicker (#778).

import WeaponAttackCard from "@/features/session/WeaponAttackCard";
import WeaponDamageCard from "@/features/session/WeaponDamageCard";
import type { AttackEntryView } from "@/features/session/useAttackRolls";
import type { AttackEntry } from "@/lib/attackMath";
import type { Character } from "@/types/character";

interface WeaponAttackListProps {
  weaponEntries: AttackEntry[];
  activeEntry: AttackEntry | null;
  onSelectWeapon: (id: string) => void;
  attacksExhausted: boolean;
  viewFor: (entry: AttackEntry) => AttackEntryView;
  riderTotals: Record<string, number>;
  showManeuvers: boolean;
  character: Character;
  onUpdate: (c: Character) => void;
}

export default function WeaponAttackList({
  weaponEntries,
  activeEntry,
  onSelectWeapon,
  attacksExhausted,
  viewFor,
  riderTotals,
  showManeuvers,
  character,
  onUpdate,
}: WeaponAttackListProps) {
  return (
    <>
      {weaponEntries.length === 0 && (
        <p className="text-sm text-parchment-600">
          No weapon equipped — use Change on the turn screen.
        </p>
      )}

      {weaponEntries.map((entry) => {
        const view = viewFor(entry);
        return (
          <WeaponAttackCard
            key={entry.id}
            entry={entry}
            active={activeEntry?.id === entry.id}
            attacksExhausted={attacksExhausted}
            attackTotal={view.attackTotal}
            lastAttackRoll={view.lastAttackRoll}
            onSelect={() => onSelectWeapon(entry.id)}
            onRollToHit={() => {
              onSelectWeapon(entry.id);
              view.onAttack();
            }}
          />
        );
      })}

      {activeEntry && (
        <WeaponDamageCard
          key={activeEntry.id}
          view={viewFor(activeEntry)}
          showManeuvers={showManeuvers}
          character={character}
          riderTotals={riderTotals}
          onUpdate={onUpdate}
        />
      )}
    </>
  );
}
