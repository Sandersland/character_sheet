import { useEffect, useState } from "react";

import { updateCharacter } from "@/api/client";
import type { Character, Currency } from "@/types/character";
import CurrencyEditForm from "@/features/inventory/CurrencyEditForm";
import { formatCurrency } from "@/lib/currency";

interface CurrencyEditorProps {
  character: Character;
  onUpdate: (character: Character) => void;
}

// Display-first purse: shows the formatted currency with an "Edit purse" toggle revealing the denomination inputs. Reuses PATCH /api/characters/:id (a bare currency edit has no item and isn't ledgered).
export default function CurrencyEditor({ character, onUpdate }: CurrencyEditorProps) {
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
    <CurrencyEditForm
      currency={currency}
      pending={pending}
      error={error}
      onChange={setCurrency}
      onSave={save}
      onCancel={() => setEditing(false)}
    />
  );
}
