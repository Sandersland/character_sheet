import { useEffect, useState } from "react";

import { updateCharacter } from "@/api/client";
import { useCurrentCharacter } from "@/hooks/CurrentCharacterProvider";
import { useCharacterMutation } from "@/hooks/useCharacterMutation";
import type { Currency } from "@/types/character";
import CurrencyEditForm from "@/features/inventory/CurrencyEditForm";
import { formatCurrency } from "@/lib/currency";

// Reuses PATCH /api/characters/:id: a bare currency edit has no item and isn't ledgered.
export default function CurrencyEditor() {
  const { character } = useCurrentCharacter();
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
