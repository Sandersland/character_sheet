import Field from "@/components/ui/Field";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { Trash2 } from "@/components/ui/icons";
import CastSpellFields from "@/features/entities/CastSpellFields";
import ChargesFields from "@/features/entities/ChargesFields";
import GrantFields from "@/features/entities/GrantFields";
import PassiveBonusFields from "@/features/entities/PassiveBonusFields";
import { CAPABILITY_KIND_OPTIONS, capabilitySummary } from "@/lib/capabilities";
import { draftForKind } from "@/lib/capabilityDraft";
import type { CapabilityKind, CatalogSpell, ItemCapability } from "@/types/character";

interface CapabilityRowProps {
  cap: ItemCapability;
  index: number;
  spells: CatalogSpell[];
  spellcasterAttunable: boolean;
  onChange: (patch: Partial<ItemCapability>) => void;
  onReplace: (next: ItemCapability) => void;
  onRemove: () => void;
}

// One capability card: a kind picker, the kind's field subcomponent, and a shared
// description. Changing kind replaces the whole draft; field edits are patches.
export default function CapabilityRow({ cap, index, spells, spellcasterAttunable, onChange, onReplace, onRemove }: CapabilityRowProps) {
  return (
    <li className="flex flex-col gap-2 rounded-control border border-parchment-200 bg-parchment-50 p-2.5">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium text-parchment-800">{capabilitySummary(cap)}</span>
        <button
          type="button"
          aria-label={`Remove capability ${index + 1}`}
          onClick={onRemove}
          className="flex h-6 w-6 items-center justify-center rounded-control text-parchment-500 hover:bg-parchment-200 hover:text-garnet-700"
        >
          <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
      </div>

      <Field label="Kind" htmlFor={`cap-${index}-kind`}>
        <Select
          id={`cap-${index}-kind`}
          value={cap.kind}
          onChange={(e) => onReplace(draftForKind(e.target.value as CapabilityKind))}
        >
          {CAPABILITY_KIND_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>

      {cap.kind === "castSpell" ? (
        <CastSpellFields cap={cap} index={index} spells={spells} spellcasterAttunable={spellcasterAttunable} onChange={onChange} />
      ) : cap.kind === "grant" ? (
        <GrantFields cap={cap} index={index} onUpdate={onChange} />
      ) : cap.kind === "charges" ? (
        <ChargesFields cap={cap} index={index} onUpdate={onChange} />
      ) : (
        <PassiveBonusFields cap={cap} index={index} onChange={onChange} />
      )}

      <Field label="Description (optional)" htmlFor={`cap-${index}-desc`}>
        <Input
          id={`cap-${index}-desc`}
          value={cap.description ?? ""}
          onChange={(e) => onChange({ description: e.target.value || undefined })}
        />
      </Field>
    </li>
  );
}
