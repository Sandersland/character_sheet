import { useState, type Dispatch } from "react";

import Spinner from "@/components/ui/Spinner";
import CustomFeatForm from "@/features/advancement/CustomFeatForm";
import type { FeatView, FeatViewAction } from "@/features/advancement/featView";
import type { CustomFeatDraft } from "@/features/advancement/useCustomFeatDraft";
import type { FeatCatalog } from "@/features/advancement/useFeatCatalog";
import { abilityLabel } from "@/lib/abilities";
import { abilityScorePreviews, featAbilityChipLabel } from "@/lib/featDisplay";
import type { CatalogFeat } from "@/types/character";

interface Props {
  currentScores: Record<string, number>;
  skillNames: string[];
  busy: boolean;
  feats: FeatCatalog;
  view: FeatView;
  dispatchView: Dispatch<FeatViewAction>;
  custom: CustomFeatDraft;
  onSubmit: () => void;
  /** #1173: the level-up ceremony's step body is already the single scroll region
   *  (post-#1192), so its own inner cap would double-scroll — only the plain sheet
   *  Overview panel (AdvancementSection, unbounded page flow) needs this list capped. */
  scrollList?: boolean;
}

// Named element, not Badge — Badge's gold tone is bg-gold-50; overriding via className is stylesheet-order roulette.
function AbilityChip({ feat }: { feat: CatalogFeat }) {
  const label = featAbilityChipLabel(feat);
  if (!label) return null;
  return (
    <span className="ml-1.5 inline-flex items-center rounded-full bg-gold-100 px-2 py-0.5 text-[11px] font-semibold text-gold-800">
      {label}
    </span>
  );
}

function FeatDetail({
  feat,
  currentScores,
  busy,
  abilityChoice,
  onBack,
  onChoose,
  onSubmit,
}: {
  feat: CatalogFeat;
  currentScores: Record<string, number>;
  busy: boolean;
  abilityChoice: string;
  onBack: () => void;
  onChoose: (key: string) => void;
  onSubmit: () => void;
}) {
  const needsChoice = feat.abilityOptions.length > 1;
  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="mb-3 text-xs text-parchment-600 hover:text-parchment-800"
      >
        ← Back to list
      </button>
      <p className="flex items-center font-display text-lg font-semibold text-parchment-900">
        {feat.name}
        <AbilityChip feat={feat} />
      </p>
      {feat.prerequisite && (
        <p className="mt-0.5 text-[11px] italic text-parchment-600">Requires: {feat.prerequisite}</p>
      )}
      <p className="mt-1.5 text-sm leading-relaxed text-parchment-600">{feat.description}</p>

      {needsChoice && (
        <div className="mt-3">
          <p className="mb-1.5 text-xs font-semibold text-parchment-700">
            Choose +{feat.abilityIncrease} to:
          </p>
          <div
            role="radiogroup"
            aria-label={`Choose +${feat.abilityIncrease} to`}
            className="grid gap-2 sm:grid-cols-3"
          >
            {abilityScorePreviews(feat, currentScores).map((p) => {
              const chosen = abilityChoice === p.key;
              return (
                <button
                  key={p.key}
                  type="button"
                  role="radio"
                  aria-checked={chosen}
                  aria-label={p.label}
                  onClick={() => onChoose(p.key)}
                  className={`flex flex-col gap-0.5 rounded-control border p-2.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-garnet-400 ${
                    chosen
                      ? "border-garnet-600 bg-garnet-50 ring-2 ring-garnet-600"
                      : "border-parchment-300 bg-parchment-50 hover:border-garnet-400"
                  }`}
                >
                  <span className="text-xs font-semibold text-parchment-900">{p.label}</span>
                  <span className="text-sm text-parchment-600">
                    {p.before} → {p.after}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      {feat.abilityOptions.length === 1 && (
        <p className="mt-2 text-xs text-parchment-600">
          +{feat.abilityIncrease} to {abilityLabel(feat.abilityOptions[0])} will be applied.
        </p>
      )}

      <button
        type="button"
        disabled={busy || (needsChoice && !abilityChoice)}
        onClick={onSubmit}
        className="mt-4 w-full rounded-control bg-gold-400 px-4 py-2 text-sm font-semibold text-ink hover:bg-gold-500 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Take {feat.name}
      </button>
    </div>
  );
}

function FeatListRow({
  feat,
  busy,
  onSelect,
}: {
  feat: CatalogFeat;
  busy: boolean;
  onSelect: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <li
      className={`flex items-start justify-between gap-3 rounded-control border-b border-gold-100 px-1.5 py-2.5 transition-colors last:border-0 ${
        expanded ? "bg-gold-50" : "hover:bg-gold-100/50"
      }`}
    >
      <div className="min-w-0">
        <p className="font-display text-sm font-semibold text-parchment-900">
          {feat.name}
          <AbilityChip feat={feat} />
        </p>
        {feat.prerequisite && (
          <p className="text-[10px] italic text-parchment-600">Requires: {feat.prerequisite}</p>
        )}
        <p className={`mt-0.5 text-xs leading-relaxed text-parchment-600 ${expanded ? "" : "line-clamp-2"}`}>
          {feat.description}
        </p>
        <button
          type="button"
          aria-expanded={expanded}
          aria-label={expanded ? `Show less about ${feat.name}` : `Show more about ${feat.name}`}
          onClick={() => setExpanded((v) => !v)}
          className="mt-0.5 text-[11px] font-semibold text-gold-800 hover:text-gold-900"
        >
          {expanded ? "Less" : "More"}
        </button>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={onSelect}
        className="shrink-0 rounded bg-gold-400 px-2.5 py-1 text-xs font-semibold text-ink hover:bg-gold-500 disabled:opacity-40"
      >
        Select
      </button>
    </li>
  );
}

// Extracted from FeatCatalogList (#1173) so the scrollList ternary and the row
// .map live outside the parent's branch count — keeps FeatCatalogList under the
// CRAP gate now that it carries a 5th (scrollList) prop.
function FeatCatalogRows({
  filteredCatalog,
  busy,
  dispatchView,
  scrollList,
}: {
  filteredCatalog: CatalogFeat[];
  busy: boolean;
  dispatchView: Dispatch<FeatViewAction>;
  scrollList: boolean;
}) {
  const listClass = ["pr-3", "thin-scrollbar", scrollList ? "max-h-64 overflow-y-auto" : null]
    .filter(Boolean)
    .join(" ");
  return (
    <ul className={listClass}>
      {filteredCatalog.map((feat) => (
        <FeatListRow key={feat.id} feat={feat} busy={busy} onSelect={() => dispatchView({ type: "select", feat })} />
      ))}
    </ul>
  );
}

function FeatCatalogList({
  feats,
  search,
  busy,
  dispatchView,
  scrollList,
}: {
  feats: FeatCatalog;
  search: string;
  busy: boolean;
  dispatchView: Dispatch<FeatViewAction>;
  scrollList: boolean;
}) {
  const filteredCatalog = feats.filter(search);
  return (
    <div>
      <input
        type="search"
        placeholder="Filter feats…"
        value={search}
        onChange={(e) => dispatchView({ type: "setSearch", value: e.target.value })}
        className="mb-3 w-full rounded-control border border-parchment-300 bg-parchment-50 px-2.5 py-1.5 text-sm text-parchment-900 placeholder:text-parchment-400 focus:border-gold-500 focus:outline-none"
      />
      {feats.error && <p className="text-xs text-garnet-700">{feats.error}</p>}
      {feats.catalog === null && !feats.error && feats.showSpinner && <Spinner />}
      {feats.catalog !== null && filteredCatalog.length === 0 && (
        <p className="py-2 text-center text-xs text-parchment-600">
          {search ? "No feats match your search." : "No feats in catalog."}
        </p>
      )}
      {filteredCatalog.length > 0 && (
        <FeatCatalogRows filteredCatalog={filteredCatalog} busy={busy} dispatchView={dispatchView} scrollList={scrollList} />
      )}
      <button
        type="button"
        onClick={() => dispatchView({ type: "enterCustom" })}
        className="mt-3 w-full rounded-control border border-dashed border-parchment-300 px-3 py-1.5 text-xs text-parchment-600 hover:border-parchment-400 hover:bg-parchment-50"
      >
        + Add custom feat
      </button>
    </div>
  );
}

export default function FeatFlow({
  currentScores,
  skillNames,
  busy,
  feats,
  view,
  dispatchView,
  custom,
  onSubmit,
  scrollList = true,
}: Props) {
  const { search, selectedFeat, customMode, abilityChoice } = view;

  if (selectedFeat && !customMode) {
    return (
      <FeatDetail
        feat={selectedFeat}
        currentScores={currentScores}
        busy={busy}
        abilityChoice={abilityChoice}
        onBack={() => dispatchView({ type: "back" })}
        onChoose={(value) => dispatchView({ type: "setAbilityChoice", value })}
        onSubmit={onSubmit}
      />
    );
  }

  if (customMode) {
    return (
      <CustomFeatForm
        currentScores={currentScores}
        skillNames={skillNames}
        busy={busy}
        custom={custom}
        onBack={() => { dispatchView({ type: "exitCustom" }); custom.reset(); }}
        onSubmit={onSubmit}
      />
    );
  }

  return (
    <FeatCatalogList feats={feats} search={search} busy={busy} dispatchView={dispatchView} scrollList={scrollList} />
  );
}
