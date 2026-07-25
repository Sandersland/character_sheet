import { useEffect, useState } from "react";

import { updateCharacter } from "@/api/client";
import { useCharacterMutation } from "@/hooks/useCharacterMutation";
import type { Character, Currency } from "@/types/character";
import CurrencyEditForm from "@/features/inventory/CurrencyEditForm";
import { formatCurrency } from "@/lib/currency";

interface CurrencyEditorProps {
  character: Character;
}

// Display-first purse: shows the formatted currency with an "Edit purse" toggle revealing the denomination inputs. Reuses PATCH /api/characters/:id (a bare currency edit has no item and isn't ledgered).
export default function CurrencyEditor({ character }: CurrencyEditorProps) {
  const [editing, setEditing] = useState(false);
  const [currency, setCurrency] = useState<Currency>(character.currency);

  useEffect(() => {
    setCurrency(character.currency);
  }, [character.currency]);

  const mutation = useCharacterMutation({
    characterId: character.id,
    mutationFn: (next: Currency) => updateCharacter(character.id, { currency: next }),
    toCharacter: (c) => c,
    fallbackMessage: "Failed to update purse.",
  });

  async function save() {
    try {
      await mutation.mutateAsync(currency);
      setEditing(false);
    } catch {
      // mutation.error already carries the message.
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
            mutation.reset();
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
      pending={mutation.isPending}
      error={mutation.error !== null}
      onChange={setCurrency}
      onSave={save}
      onCancel={() => setEditing(false)}
    />
  );
}
