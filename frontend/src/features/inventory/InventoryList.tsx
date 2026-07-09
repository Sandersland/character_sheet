import type { Character, Currency } from "@/types/character";
import AddItemPanel from "@/features/inventory/AddItemPanel";
import Segmented from "@/components/ui/Segmented";
import Card from "@/components/ui/Card";
import CurrencyEditor from "@/features/inventory/CurrencyEditor";
import InventoryBody from "@/features/inventory/InventoryBody";
import InventoryHeaderActions from "@/features/inventory/InventoryHeaderActions";
import InventoryMeters from "@/features/inventory/InventoryMeters";
import InventoryToolbar from "@/features/inventory/InventoryToolbar";
import { useInventoryTransactions } from "@/features/inventory/useInventoryTransactions";
import { useItemCatalog } from "@/features/inventory/useItemCatalog";
import { useSellSelection } from "@/features/inventory/useSellSelection";
import { buildSellOperations, type SellLine } from "@/lib/bulkSell";
import { carryingCapacity, coinWeight } from "@/lib/encumbrance";
import { buildSections, filterInventory, itemsWeight, selectionGp, type FilterKey } from "@/lib/inventorySections";
import { useState } from "react";

interface InventoryListProps {
  character: Character;
  onUpdate: (character: Character) => void;
}

// The sheet's inventory editor: category-sectioned rows + add/sell panels, all funneling through one submitOperations that calls POST .../inventory/transactions and swaps in the returned character.
export default function InventoryList({ character, onUpdate }: InventoryListProps) {
  const catalog = useItemCatalog();
  const { pending, error, addOpen, editingId, setAddOpen, setEditingId, applyOps, submitOperations } =
    useInventoryTransactions(character, onUpdate);
  const sell = useSellSelection();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [view, setView] = useState<"bag" | "worn">("bag");

  // Coins count toward carried weight (5e: 50 coins = 1 lb).
  const totalWeight = itemsWeight(character.inventory) + coinWeight(character.currency);
  // 5e carrying capacity = STR × 15, derive-on-read so it tracks STR changes.
  const capacity = carryingCapacity(character.abilityScores.strength);
  const hasItems = character.inventory.length > 0;
  // 5e: at most 3 attuned items. Derived from live rows; the server enforces it.
  const attunedCount = character.inventory.filter((item) => item.attuned).length;
  const atCap = attunedCount >= 3;

  const filtered = filterInventory(character.inventory, filter, search);
  const sections = buildSections(filtered);
  const selectedItems = character.inventory.filter((item) => sell.selectedIds.has(item.id));

  function enterSelectMode() {
    setAddOpen(false);
    setEditingId(null);
    sell.enterSelectMode();
  }

  async function confirmSell(lines: SellLine[], prices: Record<string, Currency>) {
    if (lines.length === 0) return;
    const ok = await applyOps(buildSellOperations(lines, { mode: "perItem", prices }));
    if (ok) sell.exitSelectMode();
  }

  return (
    <Card
      title="Inventory"
      titleAccessory={
        <InventoryHeaderActions
          selectMode={sell.selectMode}
          configuringSell={sell.configuringSell}
          selectedCount={sell.selectedIds.size}
          selectedGp={selectionGp(selectedItems)}
          pending={pending}
          hasItems={hasItems}
          addOpen={addOpen}
          onStartConfiguring={sell.startConfiguring}
          onExitSelect={sell.exitSelectMode}
          onEnterSelect={enterSelectMode}
          onToggleAdd={() => setAddOpen((open) => !open)}
        />
      }
      className="p-4"
    >
      <div className="flex flex-col gap-3">
        <InventoryMeters
          totalWeight={totalWeight}
          capacity={capacity}
          overCapacity={totalWeight > capacity}
          hasAttunable={character.inventory.some((item) => item.requiresAttunement)}
          attunedCount={attunedCount}
          atCap={atCap}
        />

        {hasItems && !sell.configuringSell && (
          <Segmented
            label="Inventory view"
            options={[
              { value: "bag", label: "Bag" },
              { value: "worn", label: "Worn" },
            ]}
            value={view}
            onChange={setView}
          />
        )}

        {hasItems && !sell.configuringSell && view === "bag" && (
          <InventoryToolbar
            search={search}
            onSearchChange={setSearch}
            filter={filter}
            onFilterChange={setFilter}
          />
        )}

        {addOpen && (
          <AddItemPanel
            items={catalog}
            pending={pending}
            onSubmit={submitOperations}
            onClose={() => setAddOpen(false)}
          />
        )}

        {error && <p className="text-xs font-semibold text-garnet-700">{error}</p>}

        <InventoryBody
          character={character}
          configuringSell={sell.configuringSell}
          selectedItems={selectedItems}
          pending={pending}
          hasItems={hasItems}
          view={view}
          sections={sections}
          editingId={editingId}
          atCap={atCap}
          selectMode={sell.selectMode}
          selectedIds={sell.selectedIds}
          onConfirmSell={confirmSell}
          onCancelSell={sell.stopConfiguring}
          onAddItem={() => setAddOpen(true)}
          onSubmit={submitOperations}
          onEdit={setEditingId}
          onCancelEdit={() => setEditingId(null)}
          onToggleSelect={sell.toggleSelect}
        />

        <CurrencyEditor character={character} onUpdate={onUpdate} />
      </div>
    </Card>
  );
}
