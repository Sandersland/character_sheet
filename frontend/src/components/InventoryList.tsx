import { useEffect, useState } from "react";

import { applyInventoryTransactions, fetchItems, updateCharacter } from "../api/client";
import type { Character, Currency, InventoryOperation, Item } from "../types/character";
import AddItemPanel from "./AddItemPanel";
import Card from "./Card";
import InventoryRow from "./InventoryRow";

interface InventoryListProps {
  character: Character;
  onUpdate: (character: Character) => void;
}

const inputClass =
  "rounded-[var(--radius-control)] border border-[var(--color-parchment-300)] bg-[var(--color-parchment-50)] px-1.5 py-0.5 text-xs tabular-nums";

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
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-parchment-200)] pt-3">
      <div className="flex items-center gap-2 text-xs text-[var(--color-parchment-600)]">
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
          className="rounded-[var(--radius-control)] bg-[var(--color-arcane-700)] px-2.5 py-1 text-xs font-semibold text-[var(--color-parchment-50)] transition-colors hover:bg-[var(--color-arcane-800)] disabled:opacity-50"
        >
          Save
        </button>
        {error && <span className="text-[var(--color-garnet-700)]">Couldn't save.</span>}
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
        <button
          type="button"
          onClick={() => setAddOpen((open) => !open)}
          className="text-xs font-semibold text-[var(--color-garnet-700)] hover:underline"
        >
          {addOpen ? "Cancel" : "+ Add item"}
        </button>
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
          <p className="text-xs font-semibold text-[var(--color-garnet-700)]">{error}</p>
        )}

        <ul className="flex flex-col divide-y divide-[var(--color-parchment-200)]">
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
              onSubmit={submitOperations}
            />
          ))}
        </ul>

        <div className="flex items-center justify-between text-xs text-[var(--color-parchment-600)]">
          <span>{totalWeight.toFixed(1)} lb carried</span>
        </div>

        <CurrencyEditor character={character} onUpdate={onUpdate} />
      </div>
    </Card>
  );
}
