// Item-provenance badges (name, uses/charges, DC, exhaustion) for an item-granted spell.
import Badge from "@/components/ui/Badge";
import type { SpellRowDerived } from "@/lib/spellRow";

interface SpellItemBadgesProps {
  item: NonNullable<SpellRowDerived["item"]>;
  atWill: boolean;
  chargeCost: number;
  itemExhausted: boolean;
}

export default function SpellItemBadges({ item, atWill, chargeCost, itemExhausted }: SpellItemBadgesProps) {
  return (
    <>
      <Badge tone="gold">{item.itemName}</Badge>
      <Badge tone="neutral">{atWill ? "at will" : `${item.usesRemaining}/${item.usesTotal}`}</Badge>
      {item.resource === "charges" && chargeCost > 1 && <Badge tone="gold">{chargeCost} charges</Badge>}
      {item.dc != null && <Badge tone="arcane">DC {item.dc}</Badge>}
      {itemExhausted && <Badge tone="neutral">{item.resource === "charges" ? "no charges" : "no uses"}</Badge>}
    </>
  );
}
