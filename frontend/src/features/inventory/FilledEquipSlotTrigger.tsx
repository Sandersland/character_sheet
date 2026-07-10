import type { IconType } from "react-icons";

import type { InventoryItem } from "@/types/character";
import type { VersatileGrip } from "@/lib/paperDoll";
import { TriangleAlert } from "@/components/ui/icons";
import Badge from "@/components/ui/Badge";
import { TILE } from "@/features/inventory/equipSlotTile";

interface FilledEquipSlotTriggerProps {
  Icon: IconType;
  item: InventoryItem;
  // The equipped item isn't covered by the character's proficiencies — warn.
  notProficient?: boolean;
  // Versatile weapon's current grip (main hand only); flips as the off-hand fills.
  grip?: VersatileGrip | null;
}

// A filled tile's Popover trigger face: icon, item name, a not-proficient
// warning glyph, and (for a versatile weapon) its current grip badge.
export default function FilledEquipSlotTrigger({
  Icon,
  item,
  notProficient,
  grip,
}: FilledEquipSlotTriggerProps) {
  return (
    <span
      className={`${TILE} relative border-solid bg-parchment-50 hover:bg-parchment-100 ${
        notProficient
          ? "border-gold-600"
          : item.rarity && item.rarity !== "COMMON"
            ? "border-arcane-300"
            : "border-parchment-300"
      }`}
    >
      {notProficient && (
        <>
          <TriangleAlert aria-hidden="true" className="absolute right-1 top-1 size-3.5 text-gold-600" />
          <span className="sr-only">Not proficient</span>
        </>
      )}
      <Icon aria-hidden="true" className="size-6 text-garnet-700" />
      <span className="line-clamp-2 text-[0.625rem] font-semibold leading-tight text-parchment-800">
        {item.name}
      </span>
      {grip && <Badge tone="neutral">{grip.short}</Badge>}
    </span>
  );
}
