import { useEffect, useState } from "react";

import { fetchSpells } from "@/api/client";
import { Plus } from "@/components/ui/icons";
import CapabilityRow from "@/features/entities/CapabilityRow";
import { NEW_PASSIVE } from "@/lib/capabilityDraft";
import type { CatalogSpell, ItemCapability } from "@/types/character";

interface CapabilityEditorProps {
  capabilities: ItemCapability[];
  onChange: (capabilities: ItemCapability[]) => void;
  /** True when the item is attunable by a spellcaster — gates wielder DC/attack (#528). */
  spellcasterAttunable?: boolean;
}

// DM authoring for an item's capabilities (#546). Each row is one capability of a
// chosen kind (passiveBonus/castSpell/grant/charges); per-kind fields live in the
// sibling *Fields subcomponents, draft normalization in capabilityDraft.
export default function CapabilityEditor({ capabilities, onChange, spellcasterAttunable = false }: CapabilityEditorProps) {
  const [spells, setSpells] = useState<CatalogSpell[]>([]);
  const needSpells = capabilities.some((c) => c.kind === "castSpell");
  useEffect(() => {
    if (needSpells && spells.length === 0) {
      fetchSpells().then(setSpells).catch(() => setSpells([]));
    }
  }, [needSpells, spells.length]);

  function update(index: number, patch: Partial<ItemCapability>) {
    onChange(capabilities.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  }

  function replace(index: number, next: ItemCapability) {
    onChange(capabilities.map((c, i) => (i === index ? next : c)));
  }

  function remove(index: number) {
    onChange(capabilities.filter((_, i) => i !== index));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-parchment-700">Capabilities</span>
        <button
          type="button"
          onClick={() => onChange([...capabilities, { ...NEW_PASSIVE }])}
          className="inline-flex items-center gap-1 text-xs font-semibold text-garnet-700 hover:underline"
        >
          <Plus aria-hidden="true" className="h-3.5 w-3.5" />
          Add capability
        </button>
      </div>

      {capabilities.length === 0 ? (
        <p className="text-xs text-parchment-500">No capabilities. Add a passive bonus or a grant (resistance, proficiency, advantage) to apply while active.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {capabilities.map((cap, index) => (
            <CapabilityRow
              key={index}
              cap={cap}
              index={index}
              spells={spells}
              spellcasterAttunable={spellcasterAttunable}
              onChange={(patch) => update(index, patch)}
              onReplace={(next) => replace(index, next)}
              onRemove={() => remove(index)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
