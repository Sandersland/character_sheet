import { Search } from "lucide-react";
import { useEffect, useState } from "react";

import { applyInventoryTransactions, fetchItems, updateCharacter } from "@/api/client";
import type { Character, Currency, InventoryOperation, Item, ItemCategory } from "@/types/character";
import AddItemPanel from "@/features/inventory/AddItemPanel";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import { GiKnapsack, ITEM_CATEGORY_ICONS } from "@/components/ui/icons";
import InventoryRow from "@/features/inventory/InventoryRow";
import MeterBar from "@/components/ui/MeterBar";
import SellPanel from "@/features/inventory/SellPanel";
import { buildSellOperations, type SellLine } from "@/lib/bulkSell";
import { formatCurrency, toCopper } from "@/lib/currency";
import { carryingCapacity } from "@/lib/encumbrance";
import { ITEM_CATEGORY_OPTIONS, ITEM_CATEGORY_ORDER, itemCategoryLabel } from "@/lib/items";

const ZERO_CURRENCY: Currency = { cp: 0, sp: 0, gp: 0, pp: 0 };

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

// Display-first purse: shows the formatted currency with an "Edit purse" toggle revealing the denomination inputs. Reuses PATCH /api/characters/:id (a bare currency edit has no item and isn't ledgered).
function CurrencyEditor({ character, onUpdate }: InventoryListProps) {
  const [editing, setEditing] = useState(false);
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
      setEditing(false);
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  }

  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-3 border-t border-parchment-200 pt-3 text-xs">
        <span className="text-parchment-700">{formatCurrency(character.currency)}</span>
        <button
          type="button"
          onClick={() => {
            setCurrency(character.currency);
            setError(false);
            setEditing(true);
          }}
          className="font-semibold text-garnet-700 hover:underline"
        >
          Edit purse
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 border-t border-parchment-200 pt-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-parchment-600">
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
      </div>
      <div className="flex items-center gap-3 text-xs">
        <button
          type="button"
          disabled={pending}
          onClick={save}
          className="rounded-control bg-arcane-700 px-2.5 py-1 font-semibold text-parchment-50 transition-colors hover:bg-arcane-800 disabled:opacity-50"
        >
          Save
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setEditing(false)}
          className="font-semibold text-garnet-700 hover:underline disabled:opacity-40"
        >
          Cancel
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [configuringSell, setConfiguringSell] = useState(false);

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

  const selectedItems = character.inventory.filter((item) => selectedIds.has(item.id));
  // Rough gp estimate for the selection bar; the sale itself uses exact per-denomination prices.
  const selectedGp = Math.round(
    selectedItems.reduce((sum, item) => sum + toCopper(item.cost ?? ZERO_CURRENCY) * item.quantity, 0) / 100
  );

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
    setConfiguringSell(false);
  }

  async function applyOps(operations: InventoryOperation[]): Promise<boolean> {
    setPending(true);
    setError(null);
    try {
      const updated = await applyInventoryTransactions(character.id, operations);
      onUpdate(updated);
      setAddOpen(false);
      setEditingId(null);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save — try again.");
      return false;
    } finally {
      setPending(false);
    }
  }

  async function submitOperations(operations: InventoryOperation[]): Promise<void> {
    await applyOps(operations);
  }

  async function confirmSell(lines: SellLine[], prices: Record<string, Currency>) {
    if (lines.length === 0) return;
    const ok = await applyOps(buildSellOperations(lines, { mode: "perItem", prices }));
    if (ok) exitSelectMode();
  }

  return (
    <Card
      title="Inventory"
      titleAccessory={
        selectMode ? (
          configuringSell ? (
            <span className="text-xs font-semibold uppercase tracking-wide text-parchment-600">
              Review sale
            </span>
          ) : (
            <div className="flex items-center gap-3 text-xs">
              <span className="text-parchment-600">
                {selectedIds.size} selected · ~{selectedGp} gp
              </span>
              <button
                type="button"
                disabled={pending || selectedIds.size === 0}
                onClick={() => setConfiguringSell(true)}
                className="font-semibold text-garnet-700 hover:underline disabled:opacity-40"
              >
                Sell
              </button>
              <button
                type="button"
                onClick={exitSelectMode}
                className="font-semibold text-parchment-600 hover:underline"
              >
                Cancel
              </button>
            </div>
          )
        ) : (
          <div className="flex items-center gap-2">
            {hasItems && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setAddOpen(false);
                    setEditingId(null);
                    setSelectedIds(new Set());
                    setSelectMode(true);
                  }}
                  className="text-xs font-semibold text-garnet-700 hover:underline"
                >
                  Sell items
                </button>
                <span className="text-parchment-300">·</span>
              </>
            )}
            <button
              type="button"
              onClick={() => setAddOpen((open) => !open)}
              className="text-xs font-semibold text-garnet-700 hover:underline"
            >
              {addOpen ? "Cancel" : "+ Add item"}
            </button>
          </div>
        )
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

        {hasItems && !configuringSell && (
          <div className="flex flex-col gap-2">
            <div className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-parchment-500"
              />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search items…"
                aria-label="Search items"
                className="w-full rounded-control border border-parchment-300 bg-parchment-50 pl-8 pr-2.5 py-1 text-sm"
              />
            </div>
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

        {error && (
          <p className="text-xs font-semibold text-garnet-700">{error}</p>
        )}

        {configuringSell ? (
          <SellPanel
            items={selectedItems}
            pending={pending}
            onConfirm={confirmSell}
            onCancel={() => setConfiguringSell(false)}
          />
        ) : !hasItems ? (
          <EmptyState
            icon={<GiKnapsack />}
            title="Your pack is empty"
            description="Add gear, weapons, and treasure to track what you're carrying."
            action={{ label: "+ Add item", onClick: () => setAddOpen(true) }}
          />
        ) : hasMatches ? (
          <div className="max-h-96 overflow-y-auto">
            {sections.map((section) => {
              const CategoryIcon = ITEM_CATEGORY_ICONS[section.category];
              return (
              <section key={section.category} className="pt-3 first:pt-0">
                <h4 className="sticky top-0 z-10 inline-flex w-full items-center gap-1.5 border-b border-parchment-200 bg-parchment-50 py-1 text-xs font-semibold uppercase tracking-wide text-parchment-600">
                  <CategoryIcon aria-hidden="true" className="text-sm" />
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
                      selectMode={selectMode}
                      selected={selectedIds.has(item.id)}
                      onToggleSelect={() => toggleSelect(item.id)}
                    />
                  ))}
                </ul>
              </section>
              );
            })}
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-parchment-600">No items match your search.</p>
        )}

        <CurrencyEditor character={character} onUpdate={onUpdate} />
      </div>
    </Card>
  );
}
