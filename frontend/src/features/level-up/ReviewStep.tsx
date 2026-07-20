// The ceremony's final "review" step (#891): renders the staged draft as a
// before→after change ledger. The Confirm/submit/error surface belongs to the
// shell (CeremonyFooter + useLevelUpSubmit) — this body is read-only. Catalog
// name lookups are fetched here (only when a matching draft list is non-empty)
// and injected into the pure buildLevelUpLedger.

import { useEffect, useState } from "react";

import { fetchDisciplines, fetchFeats, fetchManeuvers, fetchSpells } from "@/api/client";
import { useLevelUpStepContext } from "@/features/level-up/useLevelUpStepContext";
import { buildLevelUpLedger, type LedgerResolvers, type LedgerRow } from "@/lib/levelUpLedger";
import type { LevelUpDraft } from "@/lib/levelUpSteps";

type CatalogFetcher = (() => Promise<{ id: string; name: string }[]>) | undefined;

// A pending fetch leaves `map` null so `pending` can gate the resolving affordance;
// a failed fetch resolves to {} so lookups fall back to id/custom names, never block.
// `fetcher` is undefined when its draft list is empty — the caller must resolve it
// only then, so a sibling step's partial API mock is never read for a skipped
// catalog (a plain named import throws on a missing mock export even uncalled).
function useCatalogNames(fetcher: CatalogFetcher): { lookup: (id: string) => string | undefined; pending: boolean } {
  const [map, setMap] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    if (!fetcher) return;
    let mounted = true;
    fetcher()
      .then((list) => mounted && setMap(Object.fromEntries(list.map((e) => [e.id, e.name]))))
      .catch(() => mounted && setMap({}));
    return () => {
      mounted = false;
    };
  }, [fetcher]);
  return { lookup: (id) => map?.[id], pending: !!fetcher && map === null };
}

// fallow-ignore-next-line complexity -- one thin useCatalogNames hook per ledger domain (maneuvers/disciplines/tools/feats); flat fan-out, not branchy logic (#1137 added the feat resolver)
function useLedgerResolvers(draft: LevelUpDraft): { resolvers: LedgerResolvers; resolving: boolean } {
  const maneuvers = useCatalogNames(draft.maneuvers?.length ? fetchManeuvers : undefined);
  const disciplines = useCatalogNames(draft.disciplines?.length ? fetchDisciplines : undefined);
  // Cantrips share the spell catalog, so either list gates the same fetch (#1157).
  const spells = useCatalogNames(draft.spellsLearned?.length || draft.cantripsLearned?.length ? fetchSpells : undefined);
  // Any taken feat fetches the catalog — a custom feat resolves by its own name,
  // so this needs no second (featId) guard. A Fighting Style feat (#1137) resolves
  // through the same catalog.
  const feats = useCatalogNames(
    draft.advancement?.type === "takeFeat" || draft.fightingStyleFeat ? fetchFeats : undefined,
  );
  return {
    resolvers: { maneuver: maneuvers.lookup, discipline: disciplines.lookup, spell: spells.lookup, feat: feats.lookup },
    resolving: [maneuvers, disciplines, spells, feats].some((c) => c.pending),
  };
}

function DeltaRow({ row }: { row: LedgerRow }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-dotted border-parchment-300 py-2">
      <span className="text-sm font-semibold text-parchment-700">{row.label}</span>
      <span className="flex items-baseline gap-2 font-display">
        {row.before != null && <span className="text-parchment-400 line-through">{row.before}</span>}
        {row.before != null && <span aria-hidden className="text-parchment-400">→</span>}
        <span className="font-semibold text-vitality-700">{row.after}</span>
        {row.note && <span className="ml-1 text-xs font-normal text-parchment-500">{row.note}</span>}
      </span>
    </div>
  );
}

function NoteRow({ row }: { row: LedgerRow }) {
  return (
    <p className="border-b border-dotted border-parchment-300 py-2 text-xs italic text-parchment-500">
      Recalculated: {row.note}
    </p>
  );
}

function ListRow({ row, resolving }: { row: LedgerRow; resolving: boolean }) {
  return (
    <div
      aria-busy={resolving || undefined}
      className="flex items-baseline justify-between gap-3 border-b border-dotted border-parchment-300 py-2"
    >
      <span className="text-sm font-semibold text-parchment-700">{row.label}</span>
      <ul className="flex flex-wrap justify-end gap-x-2 gap-y-1 text-right text-sm text-vitality-700">
        {(row.items ?? []).map((item, i) => (
          <li key={`${item}-${i}`}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function LedgerRowView({ row, resolving }: { row: LedgerRow; resolving: boolean }) {
  if (row.variant === "note") return <NoteRow row={row} />;
  if (row.variant === "list") return <ListRow row={row} resolving={resolving} />;
  return <DeltaRow row={row} />;
}

export default function ReviewStep() {
  const { character, draft, plan } = useLevelUpStepContext();
  const { resolvers, resolving } = useLedgerResolvers(draft);
  const rows = buildLevelUpLedger(character, draft, plan, resolvers);

  return (
    <div>
      <h2 className="text-center font-display text-xl font-semibold text-parchment-900">Confirm your advancement</h2>
      <p className="mt-1 text-center text-sm text-parchment-600">
        Everything below is applied together and can be undone.
      </p>

      <div className="mt-5">
        {rows.map((row, i) => (
          <LedgerRowView key={`${row.label}-${i}`} row={row} resolving={resolving} />
        ))}
      </div>
    </div>
  );
}
