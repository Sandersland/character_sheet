import type { Dispatch } from "react";

import Spinner from "@/components/ui/Spinner";
import CustomFeatForm from "@/features/advancement/CustomFeatForm";
import type { FeatView, FeatViewAction } from "@/features/advancement/featView";
import type { CustomFeatDraft } from "@/features/advancement/useCustomFeatDraft";
import type { FeatCatalog } from "@/features/advancement/useFeatCatalog";
import { abilityLabel } from "@/lib/abilities";

interface Props {
  currentScores: Record<string, number>;
  skillNames: string[];
  busy: boolean;
  feats: FeatCatalog;
  view: FeatView;
  dispatchView: Dispatch<FeatViewAction>;
  custom: CustomFeatDraft;
  onSubmit: () => void;
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
}: Props) {
  const { search, selectedFeat, customMode, abilityChoice } = view;
  const filteredCatalog = feats.filter(search);

  return (
    <div>
      {/* Feat detail / confirmation view */}
      {selectedFeat && !customMode && (
        <div>
          <button
            type="button"
            onClick={() => dispatchView({ type: "back" })}
            className="mb-3 text-xs text-parchment-600 hover:text-parchment-800"
          >
            ← Back to list
          </button>
          <p className="font-semibold text-parchment-900">{selectedFeat.name}</p>
          {selectedFeat.prerequisite && (
            <p className="mt-0.5 text-[11px] italic text-parchment-600">
              Prerequisite: {selectedFeat.prerequisite}
            </p>
          )}
          <p className="mt-1.5 text-xs leading-relaxed text-parchment-600">
            {selectedFeat.description}
          </p>

          {/* Half-feat ability picker */}
          {selectedFeat.abilityOptions.length > 1 && (
            <div className="mt-3">
              <label className="mb-1 block text-xs font-semibold text-parchment-700">
                Choose +{selectedFeat.abilityIncrease} to:
              </label>
              <select
                value={abilityChoice}
                onChange={(e) => dispatchView({ type: "setAbilityChoice", value: e.target.value })}
                className="w-full max-w-xs rounded-control border border-parchment-300 bg-parchment-50 px-2.5 py-1.5 text-sm text-parchment-900 focus:border-gold-500 focus:outline-none"
              >
                <option value="" disabled>Choose an ability…</option>
                {selectedFeat.abilityOptions.map((a) => (
                  <option key={a} value={a}>
                    {abilityLabel(a)} (currently {currentScores[a] ?? 10})
                  </option>
                ))}
              </select>
            </div>
          )}
          {selectedFeat.abilityOptions.length === 1 && (
            <p className="mt-2 text-xs text-parchment-600">
              +{selectedFeat.abilityIncrease} to {abilityLabel(selectedFeat.abilityOptions[0])} will be applied.
            </p>
          )}

          <button
            type="button"
            disabled={busy || (selectedFeat.abilityOptions.length > 1 && !abilityChoice)}
            onClick={onSubmit}
            className="mt-4 w-full rounded-control bg-gold-400 px-4 py-2 text-sm font-semibold text-ink hover:bg-gold-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Take feat
          </button>
        </div>
      )}

      {/* Custom feat form */}
      {customMode && (
        <CustomFeatForm
          currentScores={currentScores}
          skillNames={skillNames}
          busy={busy}
          custom={custom}
          onBack={() => { dispatchView({ type: "exitCustom" }); custom.reset(); }}
          onSubmit={onSubmit}
        />
      )}

      {/* Catalog list */}
      {!selectedFeat && !customMode && (
        <div>
          <input
            type="search"
            placeholder="Filter feats…"
            value={search}
            onChange={(e) => dispatchView({ type: "setSearch", value: e.target.value })}
            className="mb-3 w-full rounded-control border border-parchment-300 bg-parchment-50 px-2.5 py-1.5 text-sm text-parchment-900 placeholder:text-parchment-400 focus:border-gold-500 focus:outline-none"
          />
          {feats.error && (
            <p className="text-xs text-garnet-700">{feats.error}</p>
          )}
          {feats.catalog === null && !feats.error && feats.showSpinner && <Spinner />}
          {feats.catalog !== null && filteredCatalog.length === 0 && (
            <p className="py-2 text-center text-xs text-parchment-600">
              {search ? "No feats match your search." : "No feats in catalog."}
            </p>
          )}
          {filteredCatalog.length > 0 && (
            <ul className="max-h-64 overflow-y-auto">
              {filteredCatalog.map((feat) => (
                <li
                  key={feat.id}
                  className="flex items-start justify-between gap-3 border-b border-gold-100 py-2.5 last:border-0"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-parchment-900">
                      {feat.name}
                      {feat.abilityOptions.length > 0 && (
                        <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide text-gold-800">
                          half-feat
                        </span>
                      )}
                    </p>
                    {feat.prerequisite && (
                      <p className="text-[10px] italic text-parchment-600">
                        Req: {feat.prerequisite}
                      </p>
                    )}
                    <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-parchment-600">
                      {feat.description}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => dispatchView({ type: "select", feat })}
                    className="shrink-0 rounded bg-gold-400 px-2.5 py-1 text-xs font-semibold text-ink hover:bg-gold-500 disabled:opacity-40"
                  >
                    Select
                  </button>
                </li>
              ))}
            </ul>
          )}
          {/* Custom feat entry */}
          <button
            type="button"
            onClick={() => dispatchView({ type: "enterCustom" })}
            className="mt-3 w-full rounded-control border border-dashed border-parchment-300 px-3 py-1.5 text-xs text-parchment-600 hover:border-parchment-400 hover:bg-parchment-50"
          >
            + Add custom feat
          </button>
        </div>
      )}
    </div>
  );
}
