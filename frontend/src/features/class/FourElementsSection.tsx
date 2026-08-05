/**
 * FourElementsSection — 2014-only Way of the Four Elements block (#1505); disciplines are
 * fixed at level-up (monk.ts), so unlike ManeuversSection there's no anytime-swap panel.
 */

import { useEffect, useState } from "react";

import { fetchDisciplines } from "@/api/client";
import { useCurrentCharacter } from "@/hooks/CurrentCharacterProvider";
import DisciplineRow from "@/features/class/DisciplineRow";
import type { CatalogDiscipline, Character, DisciplineOperation } from "@/types/character";

interface Props {
  busy: boolean;
  onCast: (op: DisciplineOperation) => void;
}

// Remaining ki from the character's derived resource pools.
function kiRemaining(character: Character): number {
  return character.resources?.pools.find((p) => p.key === "ki")?.remaining ?? 0;
}

export default function FourElementsSection({ busy, onCast }: Props) {
  const { character } = useCurrentCharacter();
  const [catalog, setCatalog] = useState<CatalogDiscipline[] | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  // No hasFetched ref: under StrictMode the ref would suppress the second
  // mount's fetch while the first's cleanup has already nulled `mounted`,
  // dropping the result — the mounted flag alone is the StrictMode-safe
  // pattern (mirrors ShadowArtsSection/DisciplinesSection's own comment).
  useEffect(() => {
    let mounted = true;
    fetchDisciplines(character.rulesEdition)
      .then((rows) => {
        if (mounted) setCatalog(rows);
      })
      .catch(() => {
        if (mounted) setCatalogError("Couldn't load discipline catalog.");
      });
    return () => {
      mounted = false;
    };
  }, [character.rulesEdition]);

  const known = character.resources?.choicesKnown.fourElementsDisciplines ?? [];
  const catalogById = new Map((catalog ?? []).map((d) => [d.id, d]));
  const kiAvailable = kiRemaining(character);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-parchment-600">
          Elemental Disciplines
        </h3>
        {busy && <span className="text-[10px] text-parchment-600">Saving…</span>}
      </div>

      <p className="mb-3 text-xs text-parchment-600">
        Ki remaining: <span className="font-semibold text-gold-800">{kiAvailable}</span>
      </p>

      {catalogError && (
        <p className="mb-3 rounded-control bg-garnet-50 px-3 py-2 text-xs font-semibold text-garnet-700">
          {catalogError}
        </p>
      )}

      {known.length === 0 ? (
        <p className="py-3 text-center text-sm text-parchment-600">No disciplines learned yet.</p>
      ) : (
        <ul className="mb-3 divide-y divide-parchment-200">
          {known.map((entry) => (
            <DisciplineRow
              key={entry.id}
              entry={entry}
              catalog={entry.optionId ? catalogById.get(entry.optionId) : undefined}
              kiAvailable={kiAvailable}
              busy={busy}
              onCast={onCast}
            />
          ))}
        </ul>
      )}

      <p className="text-[11px] text-parchment-500">
        New disciplines are chosen when you level up (monk 3rd/6th/11th/17th).
      </p>
    </div>
  );
}
