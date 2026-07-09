// Level/school/concentration/ritual + item-provenance badges for a spellbook row.
import Badge from "@/components/ui/Badge";
import SpellItemBadges from "@/features/spells/SpellItemBadges";
import type { SpellRowDerived } from "@/lib/spellRow";
import { levelLabel } from "@/lib/spellMeta";
import type { Spell } from "@/types/character";

interface SpellRowBadgesProps {
  spell: Spell;
  derived: SpellRowDerived;
  isConcentrating: boolean;
}

export default function SpellRowBadges({ spell, derived, isConcentrating }: SpellRowBadgesProps) {
  const { item, atWill, chargeCost, itemExhausted, schoolTone, noBudget } = derived;
  return (
    <div className="flex items-center gap-1">
      <Badge tone="neutral">{levelLabel(spell.level)}</Badge>
      <Badge tone={schoolTone}>{spell.school}</Badge>
      {spell.concentration &&
        (isConcentrating ? (
          <Badge tone="arcane" className="bg-arcane-700 text-parchment-50">
            concentrating
          </Badge>
        ) : (
          <Badge tone="arcane">conc</Badge>
        ))}
      {spell.ritual && <Badge tone="gold">ritual</Badge>}
      {spell.source === "subclass" && <Badge tone="arcane">subclass</Badge>}
      {item && (
        <SpellItemBadges item={item} atWill={atWill} chargeCost={chargeCost} itemExhausted={itemExhausted} />
      )}
      {!item && noBudget && <Badge tone="neutral">no slots</Badge>}
    </div>
  );
}
