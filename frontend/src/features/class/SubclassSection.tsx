import type { Character, ClassOption } from "@/types/character";

interface Props {
  character: Character;
  classDef: ClassOption | undefined;
  needsSubclass: boolean;
  busy: boolean;
  onChoose: (subclassId: string) => void;
}

export default function SubclassSection({ character, classDef, needsSubclass, busy, onChoose }: Props) {
  if (!character.subclass && !needsSubclass) return null;

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const subclassId = e.target.value;
    if (!subclassId) return;
    onChoose(subclassId);
  }

  return (
    <div>
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-parchment-600">
        Subclass
      </h3>
      {character.subclass ? (
        <p className="text-sm font-semibold text-parchment-900">{character.subclass}</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs text-parchment-600">
            You have reached level {classDef!.subclassLevel} — choose a subclass.
          </p>
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
