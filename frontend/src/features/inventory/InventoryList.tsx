import { useEffect, useState } from "react";

import { applyInventoryTransactions, fetchItems, updateCharacter } from "@/api/client";
import type { Character, Currency, InventoryOperation, Item, ItemCategory } from "@/types/character";
import AddItemPanel from "@/features/inventory/AddItemPanel";
import BulkSellPanel from "@/features/inventory/BulkSellPanel";
import Card from "@/components/ui/Card";
import InventoryRow from "@/features/inventory/InventoryRow";
import MeterBar from "@/components/ui/MeterBar";
import { carryingCapacity } from "@/lib/encumbrance";
import { ITEM_CATEGORY_OPTIONS, ITEM_CATEGORY_ORDER, itemCategoryLabel } from "@/lib/items";

interface InventoryListProps {
  character: Character;
  onUpdate: (character: Character) => void;
}

const inputClass =
  "rounded-control border border-parchment-300 bg-parchment-50 px-1.5 py-0.5 text-xs tabular-nums";

// Compact weight: drop a trailing ".0" so section headers read "8 lb" not "8.0 lb".
function formatWeight(weight: number): string {
  return (Math.round(weight * 10) / 10).toString();
}

type FilterKey = "all" | "equipped" | ItemCategory;

// Filter chips: All, one per category (labels via ITEM_CATEGORY_OPTIONS), then Equipped.
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  ...ITEM_CATEGORY_OPTIONS,
  { key: "equipped", label: "Equipped" },
];

/** Currency purse editor — reuses the existing PATCH /api/characters/:id (currency is untouched by the Phase B endpoint, exactly like experiencePoints), not the transactions endpoint, since a bare currency edit has no item and isn't ledgered. */
function CurrencyEditor({ character, onUpdate }: InventoryListProps) {
  const [currency, setCurrency] = useState<Currency>(character.currency);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    setCurrency(character.currency);
  }, [character.currency]);

  async function save() {
    setPending(true);
    setError(false);
    try {
      const updated = await updateCharacter(character.id, { currency });
      onUpdate(updated);
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-parchment-200 pt-3">
      <div className="flex items-center gap-2 text-xs text-parchment-600">
        {(["pp", "gp", "sp", "cp"] as const).map((denomination) => (
          <label key={denomination} className="flex items-center gap-1">
            <input
              type="number"
              min={0}
              className={`${inputClass} w-14`}
              value={currency[denomination]}
              onChange={(e) => setCurrency({ ...currency, [denomination]: Number(e.target.value) })}
            />
            {denomination}
          </label>
        ))}
        <button
          type="button"
          disabled={pending}
          onClick={save}
          className="rounded-control bg-arcane-700 px-2.5 py-1 text-xs font-semibold text-parchment-50 transition-colors hover:bg-arcane-800 disabled:opacity-50"
        >
          Save
        </button>
        {error && <span className="text-garnet-700">Couldn't save.</span>}
      </div>
    </div>
  );
}

// The sheet's inventory editor: category-sectioned rows + add/sell panels, all funneling through one submitOperations that calls POST .../inventory/transactions and swaps in the returned character.
export default function InventoryList({ character, onUpdate }: InventoryListProps) {
  const [catalog, setCatalog] = useState<Item[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [bulkSellOpen, setBulkSellOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");

  useEffect(() => {
    fetchItems()
      .then(setCatalog)
      .catch(() => setCatalog([]));
  }, []);

  const totalWeight = character.inventory.reduce(
    (sum, item) => sum + (item.weight ?? 0) * item.quantity,
    0
  );
  // 5e carrying capacity = STR × 15, derive-on-read so it tracks STR changes.
  const capacity = carryingCapacity(character.abilityScores.strength);
  const overCapacity = totalWeight > capacity;
  const hasItems = character.inventory.length > 0;

  // Apply the active filter chip + name search before sectioning; encumbrance still reflects the full pack.
  const query = search.trim().toLowerCase();
  const filtered = character.inventory.filter((item) => {
    const matchesFilter =
      filter === "all" ? true : filter === "equipped" ? item.equipped : item.category === filter;
    const matchesSearch = query === "" || item.name.toLowerCase().includes(query);
    return matchesFilter && matchesSearch;
  });
  const hasMatches = filtered.length > 0;

  // Group into the canonical category order, equipped-first then alphabetical; drop empty sections.
  const sections = ITEM_CATEGORY_ORDER.map((category) => {
    const items = filtered
      .filter((item) => item.category === category)
      .sort((a, b) =>
        a.equipped !== b.equipped ? (a.equipped ? -1 : 1) : a.name.localeCompare(b.name)
      );
    const weight = items.reduce((sum, item) => sum + (item.weight ?? 0) * item.quantity, 0);
    return { category, items, weight };
  }).filter((section) => section.items.length > 0);

  async function submitOperations(operations: InventoryOperation[]) {
    setPending(true);
    setError(null);
    try {
      const updated = await applyInventoryTransactions(character.id, operations);
      onUpdate(updated);
      setAddOpen(false);
      setBulkSellOpen(false);
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save — try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card
      title="Inventory"
      titleAccessory={
        <div className="flex items-center gap-2">
          {character.inventory.length > 0 && (
            <>
              <button
                type="button"
                onClick={() =>
                  setBulkSellOpen((open) => {
                    if (!open) setAddOpen(false);
                    return !open;
                  })
                }
                className="text-xs font-semibold text-garnet-700 hover:underline"
              >
                {bulkSellOpen ? "Cancel" : "Sell multiple"}
              </button>
              <span className="text-parchment-300">·</span>
            </>
          )}
          <button
            type="button"
            onClick={() =>
              setAddOpen((open) => {
                if (!open) setBulkSellOpen(false);
                return !open;
              })
            }
            className="text-xs font-semibold text-garnet-700 hover:underline"
          >
            {addOpen ? "Cancel" : "+ Add item"}
          </button>
        </div>
      }
      className="p-4"
    >
      <div className="flex flex-col gap-3">
        {hasItems && (
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold uppercase tracking-wide text-parchment-600">
                Encumbrance
              </span>
              <span className={overCapacity ? "font-semibold text-garnet-700" : "text-parchment-600"}>
                {totalWeight.toFixed(1)} / {capacity} lb
                {overCapacity && (
                  <span className="ml-2 rounded-control bg-garnet-700 px-1.5 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wide text-parchment-50">
                    Over capacity
                  </span>
                )}
              </span>
            </div>
            <MeterBar
              current={totalWeight}
              max={capacity}
              tone={overCapacity ? "garnet" : "gold"}
              label={`Encumbrance ${totalWeight.toFixed(1)} of ${capacity} lb`}
            />
          </div>
        )}

        {hasItems && (
          <div className="flex flex-col gap-2">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search items…"
              aria-label="Search items"
              className="rounded-control border border-parchment-300 bg-parchment-50 px-2.5 py-1 text-sm"
            />
            <div role="group" aria-label="Filter items" className="flex flex-wrap gap-1.5">
              {FILTERS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  aria-pressed={filter === option.key}
                  onClick={() => setFilter(option.key)}
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                    filter === option.key
                      ? "bg-arcane-700 text-parchment-50"
                      : "border border-parchment-300 bg-parchment-50 text-parchment-700 hover:bg-parchment-100"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {addOpen && (
          <AddItemPanel
            items={catalog}
            pending={pending}
            onSubmit={submitOperations}
            onClose={() => setAddOpen(false)}
          />
        )}

        {bulkSellOpen && (
          <BulkSellPanel
            items={character.inventory}
            pending={pending}
            onSubmit={submitOperations}
            onClose={() => setBulkSellOpen(false)}
          />
        )}

        {error && (
          <p className="text-xs font-semibold text-garnet-700">{error}</p>
        )}

        {!hasItems ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <p className="text-sm text-parchment-600">Your pack is empty.</p>
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="text-xs font-semibold text-garnet-700 hover:underline"
            >
              + Add item
            </button>
          </div>
        ) : hasMatches ? (
          <div className="max-h-96 overflow-y-auto">
            {sections.map((section) => (
              <section key={section.category} className="pt-3 first:pt-0">
                <h4 className="sticky top-0 z-10 border-b border-parchment-200 bg-parchment-50 py-1 text-xs font-semibold uppercase tracking-wide text-parchment-600">
                  {itemCategoryLabel(section.category)} · {section.items.length} ·{" "}
                  {formatWeight(section.weight)} lb
                </h4>
                <ul className="flex flex-col divide-y divide-parchment-200">
                  {section.items.map((item) => (
                    <InventoryRow
                      key={item.id}
                      item={item}
                      mode={editingId === item.id ? "edit" : "view"}
                      pending={pending}
                      onEdit={() => setEditingId(item.id)}
                      onCancel={() => setEditingId(null)}
                      onSubmit={submitOperations}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-parchment-600">No items match your search.</p>
        )}

        <CurrencyEditor character={character} onUpdate={onUpdate} />
      </div>
    </Card>
  );
}
