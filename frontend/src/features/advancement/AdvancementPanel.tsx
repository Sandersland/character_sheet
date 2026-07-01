/**
 * AdvancementPanel — inline expand-in-place picker for taking an Ability Score
 * Improvement or a Feat. Mirrors AddManeuverPanel: collapsed by default, fetches
 * the feat catalog lazily on first open, not a Modal per frontend.md rules.
 *
 * Two modes (toggled by a tab bar inside the panel):
 *  - ASI   — steppers for each ability; exactly 2 points to distribute; cap 20.
 *  - Feat  — catalog search list (with optional custom entry form).
 *
 * The custom feat form supports all mechanical benefit types:
 *  - Numeric stat bonuses (speed, maxHp, armorClass, initiative) with optional perLevel
 *  - Skill proficiencies (one or more from character's skill list)
 *  - Saving throw proficiencies (one or more abilities)
 *  - Ability score increase (half-feat style: author picks eligible abilities, player
 *    chooses one when taking the feat)
 */

import { useReducer, useState } from "react";

import Spinner from "@/components/ui/Spinner";
import { useAsiDraft } from "@/features/advancement/useAsiDraft";
import { useCustomFeatDraft } from "@/features/advancement/useCustomFeatDraft";
import { useFeatCatalog } from "@/features/advancement/useFeatCatalog";
import { ABILITY_OPTIONS, abilityLabel, skillLabel } from "@/lib/abilities";
import type { AdvancementOperation, CatalogFeat } from "@/types/character";

const ABILITY_CAP = 20;

const NUMERIC_TARGETS: { value: string; label: string }[] = [
  { value: "speed", label: "Speed" },
  { value: "maxHp", label: "Max HP" },
  { value: "armorClass", label: "Armor Class" },
  { value: "initiative", label: "Initiative" },
];

interface FeatView {
  search: string;
  selectedFeat: CatalogFeat | null;
  abilityChoice: string;
  customMode: boolean;
}

type FeatViewAction =
  | { type: "select"; feat: CatalogFeat }
  | { type: "back" }
  | { type: "setSearch"; value: string }
  | { type: "setAbilityChoice"; value: string }
  | { type: "enterCustom" }
  | { type: "exitCustom" }
  | { type: "reset" };

const FEAT_VIEW_INITIAL: FeatView = { search: "", selectedFeat: null, abilityChoice: "", customMode: false };

function featViewReducer(state: FeatView, action: FeatViewAction): FeatView {
  switch (action.type) {
    case "select":
      return {
        ...state,
        selectedFeat: action.feat,
        abilityChoice: action.feat.abilityOptions.length === 1 ? action.feat.abilityOptions[0] : "",
        customMode: false,
        search: "",
      };
    case "back":
      return { ...state, selectedFeat: null, abilityChoice: "" };
    case "setSearch":
      return { ...state, search: action.value };
    case "setAbilityChoice":
      return { ...state, abilityChoice: action.value };
    case "enterCustom":
      return { ...state, customMode: true };
    case "exitCustom":
      return { ...state, customMode: false };
    case "reset":
      return { ...state, selectedFeat: null, abilityChoice: "", customMode: false };
    default:
      return state;
  }
}

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
  const { search, selectedFeat, abilityChoice, customMode } = view;

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
  const filteredCatalog = feats.filter(search);

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

  const customSubmitDisabled = custom.submitDisabled(busy);
  const abilityOptionsArr = Array.from(custom.abilityOptions);

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
        <div>
          <p className="mb-3 text-xs text-parchment-600">
            Distribute <span className="font-semibold">{asi.pointsLeft} point{asi.pointsLeft !== 1 ? "s" : ""}</span> remaining across any abilities (max 20 per score).
          </p>
          <div className="flex flex-col gap-2">
            {ABILITY_OPTIONS.map(({ key, label }) => {
              const current = currentScores[key] ?? 10;
              const bonus = asi.increases[key] ?? 0;
              const newVal = current + bonus;
              const canIncrease = asi.pointsLeft > 0 && newVal < ABILITY_CAP;
              const canDecrease = bonus > 0;

              return (
                <div key={key} className="flex items-center justify-between gap-2">
                  <span className="w-28 text-sm text-parchment-900">{label}</span>
                  <span className="tabular-nums text-sm text-parchment-600">
                    {current}
                    {bonus > 0 && (
                      <span className="ml-1 font-semibold text-gold-800">→ {newVal}</span>
                    )}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      aria-label={`Decrease ${label}`}
                      disabled={!canDecrease || busy}
                      onClick={() => asi.adjust(key, -1, current)}
                      className="flex h-6 w-6 items-center justify-center rounded-control border border-parchment-300 text-sm text-parchment-600 hover:bg-parchment-100 disabled:opacity-30"
                    >
                      −
                    </button>
                    <span className="w-4 text-center text-sm font-semibold text-gold-800">
                      {bonus > 0 ? `+${bonus}` : ""}
                    </span>
                    <button
                      type="button"
                      aria-label={`Increase ${label}`}
                      disabled={!canIncrease || busy}
                      onClick={() => asi.adjust(key, +1, current)}
                      className="flex h-6 w-6 items-center justify-center rounded-control border border-parchment-300 text-sm text-parchment-600 hover:bg-parchment-100 disabled:opacity-30"
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <button
            type="button"
            disabled={asi.totalPoints !== 2 || busy}
            onClick={handleAsiSubmit}
            className="mt-4 w-full rounded-control bg-gold-400 px-4 py-2 text-sm font-semibold text-ink hover:bg-gold-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Apply ASI
          </button>
        </div>
      )}

      {/* ── Feat tab ── */}
      {tab === "feat" && (
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
                onClick={handleFeatSubmit}
                className="mt-4 w-full rounded-control bg-gold-400 px-4 py-2 text-sm font-semibold text-ink hover:bg-gold-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Take feat
              </button>
            </div>
          )}

          {/* Custom feat form */}
          {customMode && (
            <div>
              <button
                type="button"
                onClick={() => { dispatchView({ type: "exitCustom" }); custom.reset(); }}
                className="mb-3 text-xs text-parchment-600 hover:text-parchment-800"
              >
                ← Back to list
              </button>

              {/* Name + description */}
              <div className="flex flex-col gap-2">
                <input
                  type="text"
                  placeholder="Feat name"
                  value={custom.name}
                  onChange={(e) => custom.setName(e.target.value)}
                  className="w-full rounded-control border border-parchment-300 bg-parchment-50 px-2.5 py-1.5 text-sm text-parchment-900 placeholder:text-parchment-400 focus:border-gold-500 focus:outline-none"
                />
                <textarea
                  placeholder="Description (optional)"
                  value={custom.desc}
                  onChange={(e) => custom.setDesc(e.target.value)}
                  rows={2}
                  className="w-full rounded-control border border-parchment-300 bg-parchment-50 px-2.5 py-1.5 text-sm text-parchment-900 placeholder:text-parchment-400 focus:border-gold-500 focus:outline-none"
                />
              </div>

              {/* ── Stat bonuses ── */}
              <div className="mt-4">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-parchment-600">
                  Stat Bonuses
                </p>
                {custom.statBonuses.length > 0 && (
                  <div className="mb-2 flex flex-col gap-2">
                    {custom.statBonuses.map((row) => (
                      <div key={row.id} className="flex items-center gap-2">
                        <select
                          value={row.target}
                          onChange={(e) => custom.updateStatBonus(row.id, { target: e.target.value })}
                          className="rounded-control border border-parchment-300 bg-parchment-50 px-2 py-1 text-xs text-parchment-900 focus:border-gold-500 focus:outline-none"
                        >
                          {NUMERIC_TARGETS.map((t) => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                          ))}
                        </select>
                        <span className="text-xs text-parchment-600">+</span>
                        <input
                          type="number"
                          min={1}
                          max={99}
                          value={row.amount || ""}
                          onChange={(e) => custom.updateStatBonus(row.id, { amount: Math.max(0, parseInt(e.target.value) || 0) })}
                          className="w-16 rounded-control border border-parchment-300 bg-parchment-50 px-2 py-1 text-xs text-parchment-900 focus:border-gold-500 focus:outline-none"
                          placeholder="0"
                        />
                        <label className="flex items-center gap-1 text-[11px] text-parchment-600">
                          <input
                            type="checkbox"
                            checked={row.perLevel}
                            onChange={(e) => custom.updateStatBonus(row.id, { perLevel: e.target.checked })}
                            className="rounded-sm"
                          />
                          /level
                        </label>
                        <button
                          type="button"
                          onClick={() => custom.removeStatBonus(row.id)}
                          className="ml-auto text-[11px] text-parchment-600 hover:text-garnet-600"
                          aria-label="Remove stat bonus"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  onClick={custom.addStatBonus}
                  className="text-xs text-gold-800 hover:text-gold-900"
                >
                  + Add stat bonus
                </button>
              </div>

              {/* ── Skill proficiencies ── */}
              <div className="mt-4">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-parchment-600">
                  Skill Proficiencies
                </p>
                <div className="flex flex-wrap gap-x-3 gap-y-1.5">
                  {skillNames.map((name) => (
                    <label key={name} className="flex items-center gap-1.5 text-xs text-parchment-700">
                      <input
                        type="checkbox"
                        checked={custom.grantedSkills.has(name)}
                        onChange={() => custom.toggleSkill(name)}
                        className="rounded-sm"
                      />
                      {skillLabel(name)}
                    </label>
                  ))}
                </div>
              </div>

              {/* ── Saving throw proficiencies ── */}
              <div className="mt-4">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-parchment-600">
                  Saving Throw Proficiencies
                </p>
                <div className="flex flex-wrap gap-x-3 gap-y-1.5">
                  {ABILITY_OPTIONS.map(({ key, label }) => (
                    <label key={key} className="flex items-center gap-1.5 text-xs text-parchment-700">
                      <input
                        type="checkbox"
                        checked={custom.grantedSaves.has(key)}
                        onChange={() => custom.toggleSave(key)}
                        className="rounded-sm"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>

              {/* ── Ability score increase (half-feat style) ── */}
              <div className="mt-4">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-parchment-600">
                  Ability Score Increase
                </p>
                <p className="mb-2 text-[11px] text-parchment-600">
                  Check abilities the player may choose from when taking this feat.
                </p>
                <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1.5">
                  {ABILITY_OPTIONS.map(({ key, label }) => (
                    <label key={key} className="flex items-center gap-1.5 text-xs text-parchment-700">
                      <input
                        type="checkbox"
                        checked={custom.abilityOptions.has(key)}
                        onChange={() => custom.toggleAbilityOption(key)}
                        className="rounded-sm"
                      />
                      {label}
                    </label>
                  ))}
                </div>
                {abilityOptionsArr.length > 0 && (
                  <label className="flex items-center gap-2 text-xs text-parchment-700">
                    Amount:
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={custom.abilityIncrease}
                      onChange={(e) => custom.setAbilityIncrease(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-16 rounded-control border border-parchment-300 bg-parchment-50 px-2 py-1 text-xs text-parchment-900 focus:border-gold-500 focus:outline-none"
                    />
                  </label>
                )}
                {/* Player choice picker — only shown when taking the feat and >1 option */}
                {abilityOptionsArr.length > 1 && (
                  <div className="mt-2">
                    <label className="mb-1 block text-xs font-semibold text-parchment-700">
                      Choose +{custom.abilityIncrease} to:
                    </label>
                    <select
                      value={custom.abilityChoice}
                      onChange={(e) => custom.setAbilityChoice(e.target.value)}
                      className="w-full max-w-xs rounded-control border border-parchment-300 bg-parchment-50 px-2.5 py-1.5 text-sm text-parchment-900 focus:border-gold-500 focus:outline-none"
                    >
                      <option value="" disabled>Choose an ability…</option>
                      {abilityOptionsArr.map((a) => (
                        <option key={a} value={a}>
                          {abilityLabel(a)} (currently {currentScores[a] ?? 10})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {abilityOptionsArr.length === 1 && (
                  <p className="mt-1.5 text-[11px] text-parchment-600">
                    +{custom.abilityIncrease} to {abilityLabel(abilityOptionsArr[0])} will be applied automatically.
                  </p>
                )}
              </div>

              <button
                type="button"
                disabled={customSubmitDisabled}
                onClick={handleFeatSubmit}
                className="mt-4 w-full rounded-control bg-gold-400 px-4 py-2 text-sm font-semibold text-ink hover:bg-gold-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Add custom feat
              </button>
            </div>
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
      )}
    </div>
  );
}
