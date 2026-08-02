import { useCurrentCharacter } from "@/hooks/CurrentCharacterProvider";
import type { ClassOption } from "@/types/character";

interface Props {
  classDef: ClassOption | undefined;
  needsSubclass: boolean;
  /** #1598: the held subclass row is edition-tagged for a different edition
   *  than the character's own (a catalog retag after the pick). Renders the
   *  picker ALONGSIDE the stranded name (rather than instead of it), plus an
   *  explanation — reusing the existing setSubclass op, no new endpoint. */
  subclassUnavailable: boolean;
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

export default function SubclassSection({ classDef, needsSubclass, subclassUnavailable, busy, onChoose }: Props) {
  const { character } = useCurrentCharacter();
  if (!character.subclass && !needsSubclass) return null;

  // A stranded entry still shows its held name (buildClassesView emits it
  // unconditionally, #1598) — this additionally opens the picker for it,
  // rather than only for "never picked", so the player has a way out.
  //
  // `classDef` is required because the option list comes from it, and it is
  // genuinely absent for a beat: ClassPanel passes `reference?.classes ?? []`
  // while the reference query resolves. The retired deriveNeedsSubclass used
  // to make that unreachable (`if (!classDef) return false` meant
  // needsSubclass implied classDef); once the flag moved to the wire the
  // backend can't know whether the client's catalog has loaded, so the guard
  // has to live here instead. The name and the explanation below need no
  // catalog and still render.
  const showPicker = !character.subclass || subclassUnavailable;

  return (
    <div>
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-parchment-600">
        Subclass
      </h3>
      {character.subclass && (
        <p className="text-sm font-semibold text-parchment-900">{character.subclass}</p>
      )}
      {subclassUnavailable && (
        <p className="mt-1 text-xs text-garnet-700">
          {character.subclass} isn&apos;t part of {character.rulesEditionLabel} — choose a new subclass below.
        </p>
      )}
      {showPicker && classDef && (
        <SubclassPicker
          classDef={classDef}
          showGatePrompt={!character.subclass}
          busy={busy}
          onChoose={onChoose}
        />
      )}
    </div>
  );
}
