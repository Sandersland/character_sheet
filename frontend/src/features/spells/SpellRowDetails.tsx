// Expanded description + stats block for a spellbook row.
import { attackTypeLabel, upcastHint } from "@/lib/spellMeta";
import type { Spell } from "@/types/character";

export default function SpellRowDetails({ spell }: { spell: Spell }) {
  return (
    <div className="mt-2 space-y-1 rounded-control bg-parchment-50 p-3">
      <p className="text-xs text-parchment-600">
        {spell.castingTime} · {spell.range} · {spell.duration}
      </p>
      {attackTypeLabel(spell) && (
        <p className="text-xs text-parchment-600">{attackTypeLabel(spell)}</p>
      )}
      {spell.components?.material && spell.components.materialDescription && (
        <p className="text-xs text-parchment-600 italic">
          Material: {spell.components.materialDescription}
        </p>
      )}
      {upcastHint(spell) && (
        <p className="text-xs text-arcane-700">{upcastHint(spell)}</p>
      )}
      <p className="text-sm text-parchment-700">{spell.description}</p>
    </div>
  );
}
