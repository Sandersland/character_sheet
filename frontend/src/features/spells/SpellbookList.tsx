// The grouped Spellbook list (cantrips + leveled groups of SpellRows).
import EmptyState from "@/components/ui/EmptyState";
import { GiSpellBook } from "@/components/ui/icons";
import SpellRow from "@/features/spells/SpellRow";
import type { Spell, SpellSlots } from "@/types/character";

interface SpellbookListProps {
  spells: Spell[];
  sortedSpells: Spell[];
  spellLevels: number[];
  slots: SpellSlots[];
  characterLevel: number;
  busy: boolean;
  concentratingOnEntryId: string | null;
  onCast: (spell: Spell, slotLevel?: number) => void;
  onPrepare: (spell: Spell) => void;
  onForget: (spell: Spell) => void;
  availableSlotsFor: (spell: Spell) => number[];
  onAddSpell: () => void;
}

interface SpellLevelGroupProps extends Omit<SpellbookListProps, "spells" | "spellLevels" | "onAddSpell"> {
  level: number;
}

function SpellLevelGroup({
  level, sortedSpells, slots, characterLevel, busy,
  concentratingOnEntryId, onCast, onPrepare, onForget, availableSlotsFor,
}: SpellLevelGroupProps) {
  const levelSpells = sortedSpells.filter((s) => s.level === level);
  const slotInfo = level === 0 ? null : slots.find((s) => s.level === level);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-arcane-700">
          {level === 0 ? "Cantrips" : `Level ${level}`}
        </h4>
        {slotInfo && (
          <span className="text-[11px] tabular-nums text-arcane-700">
            {slotInfo.total - slotInfo.used}/{slotInfo.total} slots
          </span>
        )}
      </div>
      <ul className="flex flex-col">
        {levelSpells.map((spell) => (
          <SpellRow
            key={spell.id}
            spell={spell}
            characterLevel={characterLevel}
            busy={busy}
            onCast={onCast}
            onPrepare={onPrepare}
            onForget={onForget}
            availableSlots={availableSlotsFor(spell)}
            isConcentrating={concentratingOnEntryId === spell.id}
          />
        ))}
      </ul>
    </div>
  );
}

export default function SpellbookList({
  spells, spellLevels, onAddSpell, ...rest
}: SpellbookListProps) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-parchment-600">
          Spellbook ({spells.length})
        </h3>
        {rest.busy && <span className="text-[10px] text-parchment-600">Saving…</span>}
      </div>

      {spells.length === 0 ? (
        <EmptyState
          icon={<GiSpellBook />}
          title="No spells yet"
          description="Learn or prepare spells to start casting."
          action={{ label: "+ Add spell", onClick: onAddSpell }}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {spellLevels.map((level) => (
            <SpellLevelGroup key={level} level={level} {...rest} />
          ))}
        </div>
      )}
    </div>
  );
}
