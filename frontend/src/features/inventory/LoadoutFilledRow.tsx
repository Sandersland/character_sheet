import { EQUIP_SLOT_ICONS, TriangleAlert } from "@/components/ui/icons";
import Badge from "@/components/ui/Badge";
import AttuneToggle from "@/features/inventory/AttuneToggle";
import FilledRowActions from "@/features/inventory/FilledRowActions";
import WeaponBondToggle from "@/features/inventory/WeaponBondToggle";
import type { EquipSlot, InventoryItem, InventoryOperation, ItemRarityOption, WeaponBondOperation } from "@/types/character";
import { type FilledLoadoutRow } from "@/lib/loadout";
import { paperDollRarityLabel, rarityTone } from "@/lib/rarity";

interface LoadoutFilledRowProps {
  row: FilledLoadoutRow;
  pending: boolean;
  rarities: ItemRarityOption[];
  attunementAtCap: boolean;
  bondEligible: boolean;
  bondAtCap: boolean;
  bondPending: boolean;
  onSubmit: (operations: InventoryOperation[]) => Promise<void>;
  onBondSubmit: (operations: WeaponBondOperation[]) => Promise<void>;
  candidates: InventoryItem[];
  onUnequip: (item: InventoryItem) => void;
  onReplace: (incoming: InventoryItem, outgoing: InventoryItem) => void;
}

// Kept as its own component, not inlined into LoadoutList's row map, so that
// callback's own cyclomatic/cognitive score stays under the fallow complexity gate.
export default function LoadoutFilledRow({
  row,
  pending,
  rarities,
  attunementAtCap,
  bondEligible,
  bondAtCap,
  bondPending,
  onSubmit,
  onBondSubmit,
  candidates,
  onUnequip,
  onReplace,
}: LoadoutFilledRowProps) {
  const Icon = EQUIP_SLOT_ICONS[row.slot as EquipSlot];
  const { item, notProficient, grip } = row;
  // Null until the served rows land (#1437), so no raw enum key ever paints.
  const rarityText = paperDollRarityLabel(item.rarity, rarities);

  return (
    <li className="flex items-center gap-2 rounded-card border border-parchment-200 bg-parchment-50 px-3 py-2 max-md:rounded-none max-md:border-0 max-md:border-b max-md:px-4">
      <Icon aria-hidden="true" className="size-5 shrink-0 text-garnet-700" />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium text-parchment-900">{item.name}</span>
          {notProficient && (
            <>
              <TriangleAlert aria-hidden="true" className="size-3.5 shrink-0 text-gold-600" />
              <span className="sr-only">Not proficient</span>
            </>
          )}
        </span>
        <span className="text-xs uppercase tracking-wide text-parchment-400">{row.label}</span>
      </div>
      {grip && <Badge tone="neutral">{grip.short}</Badge>}
      {item.rarity && rarityText && <Badge tone={rarityTone(item.rarity)}>{rarityText}</Badge>}
      {item.requiresAttunement && (
        <AttuneToggle item={item} pending={pending} atCap={attunementAtCap} onSubmit={onSubmit} />
      )}
      {item.category === "weapon" && bondEligible && (
        <WeaponBondToggle item={item} pending={bondPending} atCap={bondAtCap} onSubmit={onBondSubmit} />
      )}
      <FilledRowActions
        row={row}
        candidates={candidates}
        pending={pending}
        rarities={rarities}
        onUnequip={onUnequip}
        onReplace={onReplace}
      />
    </li>
  );
}
