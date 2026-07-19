import { isMulticlass } from "@/lib/multiclass";
import type { Character, ClassEntry, ClassOption } from "@/types/character";
import AddClassPanel from "@/features/class/AddClassPanel";

interface Props {
  character: Character;
  referenceClasses: ClassOption[];
  rosterEntries: ClassEntry[];
  busy: boolean;
}

export default function ClassRosterSection({
  character,
  referenceClasses,
  rosterEntries,
  busy,
}: Props) {
  const multiclass = isMulticlass(character.classes);

  return (
    <div>
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-parchment-600">
        {multiclass ? "Classes" : "Class"}
      </h3>
      <ul className="mb-3 flex flex-col gap-1.5">
        {rosterEntries.map((entry) => (
          <li
            key={`${entry.name}-${entry.classId ?? ""}`}
            className="flex items-baseline justify-between gap-2 text-sm"
          >
            <span className="font-semibold text-parchment-900">
              {entry.name}
              {entry.subclass ? (
                <span className="ml-1.5 text-xs font-normal text-parchment-600">
                  {entry.subclass}
                </span>
              ) : null}
            </span>
            <span className="tabular-nums text-parchment-600">Level {entry.level}</span>
          </li>
        ))}
      </ul>
      {multiclass && (
        <p className="mb-3 text-xs text-parchment-600">
          Total character level{" "}
          <span className="font-semibold text-parchment-900">{character.level}</span>
        </p>
      )}
      <AddClassPanel
        character={character}
        referenceClasses={referenceClasses}
        busy={busy}
      />
    </div>
  );
}
