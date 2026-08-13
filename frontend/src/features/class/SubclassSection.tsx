import { useCurrentCharacter } from "@/hooks/CurrentCharacterProvider";
import { isMulticlass } from "@/lib/multiclass";
import type { ClassEntry, ClassOption } from "@/types/character";

interface Props {
  /** Per-entry subclass state (#1602): reads needsSubclass/subclassUnavailable from the entry, not character.subclass. */
  entry: ClassEntry;
  classDef: ClassOption | undefined;
  busy: boolean;
  onChoose: (subclassId: string) => void;
}

interface PickerProps {
  classDef: ClassOption;
  /** The "you have reached level N" prompt belongs to a first-time pick only —
   *  a stranded re-pick (#1598) gets its own explanation instead. */
  showGatePrompt: boolean;
  busy: boolean;
  onChoose: (subclassId: string) => void;
}

// Split from SubclassSection so each stays under the fallow size/complexity
// bars: the parent decides WHETHER to offer a pick, this owns the control.
function SubclassPicker({ classDef, showGatePrompt, busy, onChoose }: PickerProps) {
  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const subclassId = e.target.value;
    if (!subclassId) return;
    onChoose(subclassId);
  }

  return (
    <div className="mt-1.5 flex flex-col gap-1.5">
      {showGatePrompt && (
        <p className="text-xs text-parchment-600">
          You have reached level {classDef.subclassGateLevel} — choose a subclass.
        </p>
      )}
      <select
        defaultValue=""
        onChange={handleChange}
        disabled={busy}
        className="w-full max-w-xs rounded-control border border-parchment-300 bg-parchment-50 px-2.5 py-1.5 text-sm text-parchment-900 focus:border-garnet-500 focus:outline-none disabled:opacity-50"
      >
        <option value="" disabled>Choose a subclass…</option>
        {(classDef.subclasses ?? []).map((sub) => (
          <option key={sub.id} value={sub.id}>
            {sub.name}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function SubclassSection({ entry, classDef, busy, onChoose }: Props) {
  const { character } = useCurrentCharacter();
  const { subclass, needsSubclass, subclassUnavailable } = entry;
  if (!subclass && !needsSubclass) return null;

  // A stranded entry still shows its held name (buildClassesView always sends
  // it, #1598). We also open the picker for it, not only for "never picked",
  // so the player has a way to fix it.
  //
  // We check `subclassUnavailable` here, not `needsSubclass`, even though the
  // backend's `needsSubclass` answers a similar question. The two differ for
  // a homebrew subclass — a name with no catalog row (#911). There,
  // `needsSubclass` is true, but the player chose that name on purpose and
  // should not be asked to replace it.
  //
  // `classDef` can be missing for a moment while the reference catalog is
  // still loading. When that happens we still show the name and the
  // explanation, and only skip the picker until `classDef` arrives.
  const showPicker = !subclass || subclassUnavailable;
  // #1602: a multiclass character can render more than one of these sections
  // (one per roster entry that holds or needs a subclass) — name the class so
  // the sections are distinguishable. A single-class sheet keeps the plain
  // "Subclass" heading it always had.
  const heading = isMulticlass(character.classes) ? `${entry.name} Subclass` : "Subclass";

  return (
    <div>
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-parchment-600">
        {heading}
      </h3>
      {subclass && (
        <p className="text-sm font-semibold text-parchment-900">{subclass}</p>
      )}
      {subclassUnavailable && (
        <p className="mt-1 text-xs text-garnet-700">
          {subclass} isn&apos;t part of {character.rulesEditionLabel} — choose a new subclass below.
        </p>
      )}
      {showPicker && classDef && (
        <SubclassPicker
          classDef={classDef}
          showGatePrompt={!subclass}
          busy={busy}
          onChoose={onChoose}
        />
      )}
    </div>
  );
}
