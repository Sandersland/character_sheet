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

export default function SubclassSection({ classDef, needsSubclass, subclassUnavailable, busy, onChoose }: Props) {
  const { character } = useCurrentCharacter();
  if (!character.subclass && !needsSubclass) return null;

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const subclassId = e.target.value;
    if (!subclassId) return;
    onChoose(subclassId);
  }

  // A stranded entry still shows its held name (buildClassesView emits it
  // unconditionally, #1598) — showPicker additionally opens the picker for
  // it, rather than only for "never picked", so the player has a way out.
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
      {showPicker && (
        <div className="mt-1.5 flex flex-col gap-1.5">
          {!character.subclass && (
            <p className="text-xs text-parchment-600">
              You have reached level {classDef!.subclassGateLevel} — choose a subclass.
            </p>
          )}
          <select
            defaultValue=""
            onChange={handleChange}
            disabled={busy}
            className="w-full max-w-xs rounded-control border border-parchment-300 bg-parchment-50 px-2.5 py-1.5 text-sm text-parchment-900 focus:border-garnet-500 focus:outline-none disabled:opacity-50"
          >
            <option value="" disabled>Choose a subclass…</option>
            {(classDef!.subclasses ?? []).map((sub) => (
              <option key={sub.id} value={sub.id}>
                {sub.name}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
