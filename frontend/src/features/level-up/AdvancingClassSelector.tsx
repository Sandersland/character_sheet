// Multiclass "which class advances?" radio group for the HP step (#887). Only
// existing entries — multiclassing into a new class is out of scope (#892).

import type { ClassEntry } from "@/types/character";

export default function AdvancingClassSelector({
  entries,
  classEntryId,
  onSelect,
}: {
  entries: ClassEntry[];
  classEntryId: string | undefined;
  onSelect: (id: string) => void;
}) {
  return (
    <fieldset className="mb-5 flex flex-col gap-2">
      <legend className="text-[11px] font-bold uppercase tracking-wide text-parchment-500">
        Which class advances?
      </legend>
      {entries.map((entry) => (
        <label key={entry.id} className="flex items-center gap-2 text-sm text-parchment-800">
          <input
            type="radio"
            name="levelup-advancing-class"
            checked={classEntryId === entry.id}
            onChange={() => onSelect(entry.id)}
          />
          {entry.name} {entry.level} → {entry.level + 1}
        </label>
      ))}
    </fieldset>
  );
}
