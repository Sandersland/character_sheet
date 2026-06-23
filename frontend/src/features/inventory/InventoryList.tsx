import { useEffect, useState } from "react";

import { applyInventoryTransactions, fetchItems, updateCharacter } from "@/api/client";
import type { Character, Currency, InventoryOperation, Item } from "@/types/character";
import AddItemPanel from "@/features/inventory/AddItemPanel";
import Card from "@/components/ui/Card";
import InventoryRow from "@/features/inventory/InventoryRow";
import LedgerModal from "@/features/inventory/LedgerModal";
import { carryingCapacity } from "@/lib/encumbrance";

// undefined = closed, null = open unfiltered, {id,name} = open filtered to
// one row — see LedgerModal's comment for why both views share one modal.
type LedgerFilter = { id: string; name?: string } | null | undefined;

interface InventoryListProps {
  character: Character;
  onUpdate: (character: Character) => void;
}

const inputClass =
  "rounded-control border border-parchment-300 bg-parchment-50 px-1.5 py-0.5 text-xs tabular-nums";

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

/**
 * The character sheet's inventory editor: a read-only display (Phase A) per
 * row (`InventoryRow`) plus an "+ Add Item" panel (`AddItemPanel`), both
 * funneling through one `submitOperations` here that calls the
 * `POST .../inventory/transactions` batch endpoint and swaps in the
 * returned character via `onUpdate` — the same whole-character-replace
 * pattern `ExperienceTracker` already uses for `PATCH`.
 */
export default function InventoryList({ character, onUpdate }: InventoryListProps) {
  const [catalog, setCatalog] = useState<Item[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [sellingId, setSellingId] = useState<string | null>(null);
  const [ledgerFilter, setLedgerFilter] = useState<LedgerFilter>(undefined);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function submitOperations(operations: InventoryOperation[]) {
    setPending(true);
    setError(null);
    try {
      const updated = await applyInventoryTransactions(character.id, operations);
      onUpdate(updated);
      setAddOpen(false);
      setEditingId(null);
      setSellingId(null);
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
          <button
            type="button"
            onClick={() => setLedgerFilter(null)}
            className="text-xs font-semibold text-garnet-700 hover:underline"
          >
            History
          </button>
          <span className="text-parchment-300">·</span>
          <button
            type="button"
            onClick={() => setAddOpen((open) => !open)}
            className="text-xs font-semibold text-garnet-700 hover:underline"
          >
            {addOpen ? "Cancel" : "+ Add item"}
          </button>
        </div>
      }
      className="p-4"
    >
      <div className="flex flex-col gap-3">
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

        <ul className="flex flex-col divide-y divide-parchment-200">
          {character.inventory.map((item) => (
            <InventoryRow
              key={item.id}
              item={item}
              mode={editingId === item.id ? "edit" : sellingId === item.id ? "sell" : "view"}
              pending={pending}
              onEdit={() => {
                setSellingId(null);
                setEditingId(item.id);
              }}
              onSell={() => {
                setEditingId(null);
                setSellingId(item.id);
              }}
              onCancel={() => {
                setEditingId(null);
                setSellingId(null);
              }}
              onHistory={() => setLedgerFilter({ id: item.id, name: item.name })}
              onSubmit={submitOperations}
            />
          ))}
        </ul>

        <div className="flex items-center justify-between text-xs text-parchment-600">
          <span className={overCapacity ? "font-semibold text-garnet-700" : undefined}>
            {totalWeight.toFixed(1)} / {capacity} lb
            {overCapacity && (
              <span className="ml-2 rounded-control bg-garnet-700 px-1.5 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wide text-parchment-50">
                Over capacity
              </span>
            )}
          </span>
        </div>

        <CurrencyEditor character={character} onUpdate={onUpdate} />
      </div>

      {ledgerFilter !== undefined && (
        <LedgerModal
          characterId={character.id}
          inventoryItemId={ledgerFilter?.id}
          itemName={ledgerFilter?.name}
          onClose={() => setLedgerFilter(undefined)}
        />
      )}
    </Card>
  );
}
