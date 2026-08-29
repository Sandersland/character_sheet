// Confirm/submit/error surface belongs to CeremonyFooter + useLevelUpSubmit; this body is read-only, feeding the pure buildLevelUpLedger.

import { useEffect, useMemo, useState } from "react";

import { fetchFeats, fetchManeuvers, fetchSpells } from "@/api/client";
import { useLevelUpStepContext } from "@/features/level-up/useLevelUpStepContext";
import { buildLevelUpLedger, type LedgerResolvers, type LedgerRow } from "@/lib/levelUpLedger";
import type { LevelUpDraft } from "@/lib/levelUpSteps";
import { schoolInk } from "@/lib/spellFlavor";
import { levelLabel, schoolLabel } from "@/lib/spellMeta";
import type { RulesEdition } from "@character-sheet/shared-types";

type CatalogFetcher = (() => Promise<{ id: string; name: string }[]>) | undefined;

// `fetcher` is undefined when its draft list is empty so a sibling step's unmocked catalog import is never called — a named import throws on a missing mock export even when unused.
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

// fallow-ignore-next-line complexity -- one thin useCatalogNames hook per ledger domain (maneuvers/spells/feats); flat fan-out, not branchy logic
function useLedgerResolvers(draft: LevelUpDraft, edition: RulesEdition): { resolvers: LedgerResolvers; resolving: boolean } {
  // Keyed on the boolean, never draft.maneuvers' array identity — see the [fetcher]-identity hazard at featFetcher below (#1412).
  const needsManeuvers = !!draft.maneuvers?.length;
  const maneuverFetcher = useMemo(
    () => (needsManeuvers ? () => fetchManeuvers(edition) : undefined),
    [needsManeuvers, edition],
  );
  const maneuvers = useCatalogNames(maneuverFetcher);
  // Edition here is for the wire contract, not an admission gate — this resolves id→name for an already-committed pick, so no cross-edition row can enter through it (#1411).
  const needsSpells = !!(draft.spellsLearned?.length || draft.cantripsLearned?.length);
  const spellFetcher = useMemo(
    () => (needsSpells ? () => fetchSpells(edition) : undefined),
    [needsSpells, edition],
  );
  const spells = useCatalogNames(spellFetcher);
  // A custom feat resolves by its own name, so no second featId guard is needed here.
  // Never an inline arrow — useCatalogNames's effect depends on [fetcher], so a fresh identity each render means fetch → setMap → re-render → fetch, forever.
  const needsFeats = draft.advancement?.type === "takeFeat" || !!draft.fightingStyleFeat;
  const featFetcher = useMemo(
    () => (needsFeats ? () => fetchFeats(edition) : undefined),
    [needsFeats, edition],
  );
  const feats = useCatalogNames(featFetcher);
  return {
    resolvers: { maneuver: maneuvers.lookup, spell: spells.lookup, feat: feats.lookup },
    resolving: [maneuvers, spells, feats].some((c) => c.pending),
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

// casterModel is plan.target.casterModel, not the newSpells step's meta — this card renders regardless of whether that step exists (#1509; PHB'14 p. 107 Pact Boon parallel).
function grantedSpellsFootnote(casterModel: "known" | "prepared" | null | undefined): string {
  return casterModel === "known"
    ? "Doesn't count against your number of spells known."
    : "Always prepared — doesn't count against your spells known.";
}

function GrantedSpellsCard({ row, casterModel }: { row: LedgerRow; casterModel: "known" | "prepared" | null | undefined }) {
  return (
    <div className="mt-2 rounded-card border border-gold-300 bg-gradient-to-r from-gold-50 to-gold-100 p-4">
      <p className="flex items-center gap-1.5 font-display text-sm font-semibold text-gold-900">
        <span aria-hidden="true">✦</span>
        {row.label}
      </p>
      <ul className="mt-2 divide-y divide-gold-200/60">
        {(row.grantedSpells ?? []).map((s, i) => (
          <li key={`${s.name}-${i}`} className="flex items-baseline justify-between gap-3 py-1.5 first:pt-0 last:pb-0">
            <span className={`text-sm font-semibold ${schoolInk(s.school)}`}>{s.name}</span>
            <span className={`shrink-0 text-xs ${schoolInk(s.school)}`}>
              {levelLabel(s.level)} · {schoolLabel(s.school)}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-gold-800">{grantedSpellsFootnote(casterModel)}</p>
    </div>
  );
}

function LedgerRowView({ row, resolving, casterModel }: { row: LedgerRow; resolving: boolean; casterModel: "known" | "prepared" | null | undefined }) {
  if (row.variant === "note") return <NoteRow row={row} />;
  if (row.variant === "list") return <ListRow row={row} resolving={resolving} />;
  if (row.variant === "grantedSpells") return <GrantedSpellsCard row={row} casterModel={casterModel} />;
  return <DeltaRow row={row} />;
}

export default function ReviewStep() {
  const { character, draft, plan } = useLevelUpStepContext();
  const { resolvers, resolving } = useLedgerResolvers(draft, character.rulesEdition);
  // HP row numbers come from `plan` (#1380), the same meta HitPointsStep renders, so the two screens necessarily agree (#1441).
  const rows = buildLevelUpLedger(character, draft, plan, resolvers);

  return (
    <div>
      <h2 className="text-center font-display text-xl font-semibold text-parchment-900">Confirm your advancement</h2>
      <p className="mt-1 text-center text-sm text-parchment-600">
        Everything below is applied together and can be undone.
      </p>

      <div className="mt-5">
        {rows.map((row, i) => (
          <LedgerRowView key={`${row.label}-${i}`} row={row} resolving={resolving} casterModel={plan.target.casterModel} />
        ))}
      </div>
    </div>
  );
}
