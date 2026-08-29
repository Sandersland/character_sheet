// Picks among server-resolved CatalogDiscipline.steps; never computes a roll's dice itself.
import { useState } from "react";

import AbilityRowShell, { CastAbilityButton } from "@/features/class/AbilityRowShell";
import { disciplineCastView, effectiveStep, type DisciplineCastView } from "@/lib/disciplines";
import { rollSpec } from "@/lib/dice";
import type { CatalogDiscipline, ChoiceEntry, DisciplineOperation } from "@/types/character";

interface Props {
  entry: ChoiceEntry;
  // Undefined until GET /api/disciplines resolves — the row still shows
  // name/description from the entry's own snapshot, just with casting disabled.
  catalog: CatalogDiscipline | undefined;
  kiAvailable: number;
  busy: boolean;
  onCast: (op: DisciplineOperation) => void;
}

// `catalog`/`view` are known non-null here (handleCast's own guard).
function buildCastOp(
  entryId: string,
  catalog: CatalogDiscipline,
  view: DisciplineCastView,
  selectedKi: number | undefined,
): DisciplineOperation {
  const step = effectiveStep(view, selectedKi);
  return {
    type: "castDiscipline",
    entryId,
    ...(catalog.cost.kind === "pool" ? { requestedKi: step?.ki ?? view.costBase } : {}),
    ...(step ? { roll: rollSpec(step.roll).total } : {}),
  };
}

function effectiveKiFor(view: DisciplineCastView | undefined, selectedKi: number | undefined): number | undefined {
  return view ? effectiveStep(view, selectedKi)?.ki : undefined;
}

function castTitle(entryName: string, catalog: CatalogDiscipline | undefined, view: DisciplineCastView | undefined): string {
  if (!catalog || !view) return "Loading discipline data…";
  if (!view.canAfford) return `Not enough ki (needs ${view.costBase})`;
  return `Cast ${entryName} (${view.kiLabel})`;
}

function KiPicker({
  entryId,
  entryName,
  view,
  selectedKi,
  busy,
  onChange,
}: {
  entryId: string;
  entryName: string;
  view: DisciplineCastView;
  selectedKi: number | undefined;
  busy: boolean;
  onChange: (ki: number) => void;
}) {
  const fieldId = `discipline-ki-${entryId}`;
  return (
    <>
      <label className="sr-only" htmlFor={fieldId}>
        Ki to spend on {entryName}
      </label>
      <select
        id={fieldId}
        className="rounded-control border border-parchment-300 px-1.5 py-0.5 text-[11px]"
        value={selectedKi ?? view.options[0]?.ki}
        disabled={busy}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        {view.options.map((s) => (
          <option key={s.ki} value={s.ki}>
            {s.ki} ki
          </option>
        ))}
      </select>
    </>
  );
}

export default function DisciplineRow({ entry, catalog, kiAvailable, busy, onCast }: Props) {
  const [selectedKi, setSelectedKi] = useState<number | undefined>(undefined);
  const view = catalog ? disciplineCastView(catalog, kiAvailable) : undefined;
  // Normalised through effectiveStep so a mid-session ki spend that drops the
  // selected option from view.options can't leave the picker showing a value
  // no <option> renders while the op submits a different one.
  const effectiveKi = effectiveKiFor(view, selectedKi);

  function handleCast() {
    if (busy || !catalog || !view?.canAfford) return;
    onCast(buildCastOp(entry.id, catalog, view, effectiveKi));
  }

  return (
    <AbilityRowShell
      name={entry.name}
      chips={
        view && (
          <span className="text-[10px] text-gold-700" aria-hidden="true">
            {view.kiLabel}
          </span>
        )
      }
      actions={
        <>
          {view?.scalable && (
            <KiPicker
              entryId={entry.id}
              entryName={entry.name}
              view={view}
              selectedKi={effectiveKi}
              busy={busy}
              onChange={setSelectedKi}
            />
          )}
          <CastAbilityButton
            disabled={busy || !catalog || !view?.canAfford}
            onClick={handleCast}
            title={castTitle(entry.name, catalog, view)}
          />
        </>
      }
    >
      <p className="text-xs leading-relaxed text-parchment-600">{entry.description}</p>
    </AbilityRowShell>
  );
}
