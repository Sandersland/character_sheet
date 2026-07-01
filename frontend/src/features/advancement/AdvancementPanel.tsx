// Inline expand-in-place picker for taking an Ability Score Improvement or a Feat (ASI + Feat tabs), not a Modal per frontend.md rules.

import { useReducer, useState } from "react";

import AsiFlow from "@/features/advancement/AsiFlow";
import { FEAT_VIEW_INITIAL, featViewReducer } from "@/features/advancement/featView";
import FeatFlow from "@/features/advancement/FeatFlow";
import { useAsiDraft } from "@/features/advancement/useAsiDraft";
import { useCustomFeatDraft } from "@/features/advancement/useCustomFeatDraft";
import { useFeatCatalog } from "@/features/advancement/useFeatCatalog";
import type { AdvancementOperation } from "@/types/character";

interface Props {
  currentScores: Record<string, number>;
  slotsRemaining: number;
  busy: boolean;
  /** Ordered list of skill names from the character (avoids duplicating SRD skill list). */
  skillNames: string[];
  onSubmit: (op: AdvancementOperation) => void;
}

export default function AdvancementPanel({
  currentScores,
  slotsRemaining,
  busy,
  skillNames,
  onSubmit,
}: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"asi" | "feat">("asi");

  // ── ASI state ──────────────────────────────────────────────────────────────
  const asi = useAsiDraft();

  // ── Feat state ─────────────────────────────────────────────────────────────
  const feats = useFeatCatalog(open && tab === "feat");
  const [view, dispatchView] = useReducer(featViewReducer, FEAT_VIEW_INITIAL);
  const { selectedFeat, abilityChoice, customMode } = view;

  // ── Custom feat form state ─────────────────────────────────────────────────
  const custom = useCustomFeatDraft();

  // Reset feat panel when switching mode.
  function handleTabChange(next: "asi" | "feat") {
    setTab(next);
    dispatchView({ type: "reset" });
    if (next === "feat") feats.ensureFetched();
  }

  // ── ASI helpers ────────────────────────────────────────────────────────────
  function handleAsiSubmit() {
    if (asi.totalPoints !== 2) return;
    onSubmit(asi.buildOperation());
    asi.reset();
    setOpen(false);
  }

  // ── Feat helpers ───────────────────────────────────────────────────────────
  function handleFeatSubmit() {
    if (customMode) {
      const op = custom.buildOperation();
      if (!op) return;
      onSubmit(op);
    } else if (selectedFeat) {
      const needsChoice = selectedFeat.abilityOptions.length > 1;
      if (needsChoice && !abilityChoice) return;
      onSubmit({
        type: "takeFeat",
        featId: selectedFeat.id,
        abilityChoice: selectedFeat.abilityOptions.length > 0 ? (abilityChoice || selectedFeat.abilityOptions[0]) : undefined,
      });
    }
    dispatchView({ type: "reset" });
    custom.reset();
    setOpen(false);
  }

  if (!open || slotsRemaining <= 0) {
    return (
      <div className="flex items-center justify-between">
        <button
          type="button"
          disabled={slotsRemaining <= 0 || busy}
          onClick={() => setOpen(true)}
          className="self-start rounded-control border border-dashed border-gold-400 px-3 py-1.5 text-xs font-semibold text-gold-800 hover:border-gold-600 hover:bg-gold-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          + Choose advancement
        </button>
        {slotsRemaining > 0 && (
          <span className="text-[11px] text-parchment-600">
            {slotsRemaining} slot{slotsRemaining > 1 ? "s" : ""} available
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-card border border-gold-200 bg-gold-50 p-4">
      {/* Panel header */}
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gold-900">
          Choose an Advancement
        </h3>
        <button
          type="button"
          onClick={() => { setOpen(false); asi.reset(); dispatchView({ type: "reset" }); custom.reset(); }}
          className="text-parchment-600 hover:text-parchment-700"
          aria-label="Close advancement panel"
        >
          ✕
        </button>
      </div>

      {/* Tab bar */}
      <div className="mb-4 flex gap-2">
        {(["asi", "feat"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => handleTabChange(t)}
            className={`rounded-control px-3 py-1.5 text-xs font-semibold transition-colors ${
              tab === t
                ? "bg-gold-400 text-ink"
                : "bg-parchment-50 text-parchment-600 border border-parchment-300 hover:bg-parchment-100"
            }`}
          >
            {t === "asi" ? "Ability Score" : "Feat"}
          </button>
        ))}
      </div>

      {/* ── ASI tab ── */}
      {tab === "asi" && (
        <AsiFlow currentScores={currentScores} busy={busy} asi={asi} onApply={handleAsiSubmit} />
      )}

      {/* ── Feat tab ── */}
      {tab === "feat" && (
        <FeatFlow
          currentScores={currentScores}
          skillNames={skillNames}
          busy={busy}
          feats={feats}
          view={view}
          dispatchView={dispatchView}
          custom={custom}
          onSubmit={handleFeatSubmit}
        />
      )}
    </div>
  );
}
