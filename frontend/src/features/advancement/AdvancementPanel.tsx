/**
 * AdvancementPanel — inline expand-in-place picker for taking an Ability Score
 * Improvement or a Feat. Mirrors AddManeuverPanel: collapsed by default, fetches
 * the feat catalog lazily on first open, not a Modal per frontend.md rules.
 *
 * Two modes (toggled by a tab bar inside the panel):
 *  - ASI   — steppers for each ability; exactly 2 points to distribute; cap 20.
 *  - Feat  — catalog search list (with optional custom entry form).
 */

import { useEffect, useRef, useState } from "react";

import { fetchFeats } from "@/api/client";
import type {
  AdvancementOperation,
  CatalogFeat,
  TakeAsiOperation,
} from "@/types/character";

const ABILITIES: { key: string; label: string }[] = [
  { key: "strength", label: "Strength" },
  { key: "dexterity", label: "Dexterity" },
  { key: "constitution", label: "Constitution" },
  { key: "intelligence", label: "Intelligence" },
  { key: "wisdom", label: "Wisdom" },
  { key: "charisma", label: "Charisma" },
];

const ABILITY_CAP = 20;

interface Props {
  currentScores: Record<string, number>;
  slotsRemaining: number;
  busy: boolean;
  onSubmit: (op: AdvancementOperation) => void;
}

export default function AdvancementPanel({
  currentScores,
  slotsRemaining,
  busy,
  onSubmit,
}: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"asi" | "feat">("asi");

  // ── ASI state ──────────────────────────────────────────────────────────────
  const [asiIncreases, setAsiIncreases] = useState<Record<string, number>>({});

  // ── Feat state ─────────────────────────────────────────────────────────────
  const [catalog, setCatalog] = useState<CatalogFeat[] | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedFeat, setSelectedFeat] = useState<CatalogFeat | null>(null);
  const [abilityChoice, setAbilityChoice] = useState("");
  const [customMode, setCustomMode] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customDesc, setCustomDesc] = useState("");
  const hasFetched = useRef(false);

  // Fetch catalog the first time the panel opens and the feat tab is viewed.
  useEffect(() => {
    if (!open || tab !== "feat" || hasFetched.current) return;
    hasFetched.current = true;
    let mounted = true;
    fetchFeats()
      .then((feats) => { if (mounted) setCatalog(feats); })
      .catch(() => { if (mounted) setCatalogError("Couldn't load feat catalog."); });
    return () => { mounted = false; };
  }, [open, tab]);

  // Reset feat panel when switching mode.
  function handleTabChange(next: "asi" | "feat") {
    setTab(next);
    setSelectedFeat(null);
    setAbilityChoice("");
    setCustomMode(false);
    if (next === "feat" && !hasFetched.current) {
      hasFetched.current = true;
      fetchFeats()
        .then((feats) => { setCatalog(feats); })
        .catch(() => { setCatalogError("Couldn't load feat catalog."); });
    }
  }

  // ── ASI helpers ────────────────────────────────────────────────────────────
  const totalPoints = Object.values(asiIncreases).reduce((s, v) => s + v, 0);
  const pointsLeft = 2 - totalPoints;

  function adjustAsi(ability: string, delta: number) {
    const current = asiIncreases[ability] ?? 0;
    const next = current + delta;
    if (next < 0) return;
    if (next > 2) return;
    const newScore = (currentScores[ability] ?? 10) + next;
    if (newScore > ABILITY_CAP) return;
    const newTotal = totalPoints - current + next;
    if (newTotal > 2) return;
    setAsiIncreases({ ...asiIncreases, [ability]: next });
  }

  function handleAsiSubmit() {
    if (totalPoints !== 2) return;
    const increases = Object.entries(asiIncreases)
      .filter(([, v]) => v > 0)
      .map(([ability, amount]) => ({ ability, amount: amount as 1 | 2 }));
    const op: TakeAsiOperation = { type: "takeAsi", increases };
    onSubmit(op);
    setAsiIncreases({});
    setOpen(false);
  }

  // ── Feat helpers ───────────────────────────────────────────────────────────
  const filteredCatalog = (catalog ?? []).filter((f) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return f.name.toLowerCase().includes(q) || f.description.toLowerCase().includes(q);
  });

  function handleSelectFeat(feat: CatalogFeat) {
    setSelectedFeat(feat);
    setAbilityChoice(feat.abilityOptions.length === 1 ? feat.abilityOptions[0] : "");
    setCustomMode(false);
    setSearch("");
  }

  function handleFeatSubmit() {
    if (customMode) {
      if (!customName.trim()) return;
      onSubmit({ type: "takeFeat", custom: { name: customName.trim(), description: customDesc } });
    } else if (selectedFeat) {
      const needsChoice = selectedFeat.abilityOptions.length > 1;
      if (needsChoice && !abilityChoice) return;
      onSubmit({
        type: "takeFeat",
        featId: selectedFeat.id,
        abilityChoice: selectedFeat.abilityOptions.length > 0 ? (abilityChoice || selectedFeat.abilityOptions[0]) : undefined,
      });
    }
    setSelectedFeat(null);
    setAbilityChoice("");
    setCustomMode(false);
    setCustomName("");
    setCustomDesc("");
    setOpen(false);
  }

  if (!open || slotsRemaining <= 0) {
    return (
      <div className="flex items-center justify-between">
        <button
          type="button"
          disabled={slotsRemaining <= 0 || busy}
          onClick={() => setOpen(true)}
          className="self-start rounded-control border border-dashed border-gold-400 px-3 py-1.5 text-xs font-semibold text-gold-700 hover:border-gold-600 hover:bg-gold-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          + Choose advancement
        </button>
        {slotsRemaining > 0 && (
          <span className="text-[11px] text-parchment-400">
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
          onClick={() => { setOpen(false); setAsiIncreases({}); setSelectedFeat(null); setCustomMode(false); }}
          className="text-parchment-400 hover:text-parchment-700"
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
                ? "bg-gold-600 text-white"
                : "bg-white text-parchment-600 border border-parchment-300 hover:bg-parchment-50"
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
            Distribute <span className="font-semibold">{pointsLeft} point{pointsLeft !== 1 ? "s" : ""}</span> remaining across any abilities (max 20 per score).
          </p>
          <div className="flex flex-col gap-2">
            {ABILITIES.map(({ key, label }) => {
              const current = currentScores[key] ?? 10;
              const bonus = asiIncreases[key] ?? 0;
              const newVal = current + bonus;
              const canIncrease = pointsLeft > 0 && newVal < ABILITY_CAP;
              const canDecrease = bonus > 0;

              return (
                <div key={key} className="flex items-center justify-between gap-2">
                  <span className="w-28 text-sm text-parchment-900">{label}</span>
                  <span className="tabular-nums text-sm text-parchment-500">
                    {current}
                    {bonus > 0 && (
                      <span className="ml-1 font-semibold text-gold-700">→ {newVal}</span>
                    )}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={!canDecrease || busy}
                      onClick={() => adjustAsi(key, -1)}
                      className="flex h-6 w-6 items-center justify-center rounded-control border border-parchment-300 text-sm text-parchment-600 hover:bg-parchment-100 disabled:opacity-30"
                    >
                      −
                    </button>
                    <span className="w-4 text-center text-sm font-semibold text-gold-700">
                      {bonus > 0 ? `+${bonus}` : ""}
                    </span>
                    <button
                      type="button"
                      disabled={!canIncrease || busy}
                      onClick={() => adjustAsi(key, +1)}
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
            disabled={totalPoints !== 2 || busy}
            onClick={handleAsiSubmit}
            className="mt-4 w-full rounded-control bg-gold-600 px-4 py-2 text-sm font-semibold text-white hover:bg-gold-700 disabled:cursor-not-allowed disabled:opacity-40"
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
                onClick={() => { setSelectedFeat(null); setAbilityChoice(""); }}
                className="mb-3 text-xs text-parchment-500 hover:text-parchment-800"
              >
                ← Back to list
              </button>
              <p className="font-semibold text-parchment-900">{selectedFeat.name}</p>
              {selectedFeat.prerequisite && (
                <p className="mt-0.5 text-[11px] italic text-parchment-400">
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
                    onChange={(e) => setAbilityChoice(e.target.value)}
                    className="w-full max-w-xs rounded-control border border-parchment-300 bg-white px-2.5 py-1.5 text-sm text-parchment-900 focus:border-gold-500 focus:outline-none"
                  >
                    <option value="" disabled>Choose an ability…</option>
                    {selectedFeat.abilityOptions.map((a) => (
                      <option key={a} value={a}>
                        {a.charAt(0).toUpperCase() + a.slice(1)} (currently {currentScores[a] ?? 10})
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {selectedFeat.abilityOptions.length === 1 && (
                <p className="mt-2 text-xs text-parchment-600">
                  +{selectedFeat.abilityIncrease} to {selectedFeat.abilityOptions[0]} will be applied.
                </p>
              )}

              <button
                type="button"
                disabled={busy || (selectedFeat.abilityOptions.length > 1 && !abilityChoice)}
                onClick={handleFeatSubmit}
                className="mt-4 w-full rounded-control bg-gold-600 px-4 py-2 text-sm font-semibold text-white hover:bg-gold-700 disabled:cursor-not-allowed disabled:opacity-40"
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
                onClick={() => setCustomMode(false)}
                className="mb-3 text-xs text-parchment-500 hover:text-parchment-800"
              >
                ← Back to list
              </button>
              <div className="flex flex-col gap-2">
                <input
                  type="text"
                  placeholder="Feat name"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  className="w-full rounded-control border border-parchment-300 bg-white px-2.5 py-1.5 text-sm text-parchment-900 placeholder:text-parchment-400 focus:border-gold-500 focus:outline-none"
                />
                <textarea
                  placeholder="Description (optional)"
                  value={customDesc}
                  onChange={(e) => setCustomDesc(e.target.value)}
                  rows={3}
                  className="w-full rounded-control border border-parchment-300 bg-white px-2.5 py-1.5 text-sm text-parchment-900 placeholder:text-parchment-400 focus:border-gold-500 focus:outline-none"
                />
              </div>
              <button
                type="button"
                disabled={!customName.trim() || busy}
                onClick={handleFeatSubmit}
                className="mt-3 w-full rounded-control bg-gold-600 px-4 py-2 text-sm font-semibold text-white hover:bg-gold-700 disabled:cursor-not-allowed disabled:opacity-40"
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
                onChange={(e) => setSearch(e.target.value)}
                className="mb-3 w-full rounded-control border border-parchment-300 bg-white px-2.5 py-1.5 text-sm text-parchment-900 placeholder:text-parchment-400 focus:border-gold-500 focus:outline-none"
              />
              {catalogError && (
                <p className="text-xs text-garnet-700">{catalogError}</p>
              )}
              {catalog === null && !catalogError && (
                <p className="text-xs text-parchment-500">Loading…</p>
              )}
              {catalog !== null && filteredCatalog.length === 0 && (
                <p className="py-2 text-center text-xs text-parchment-500">
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
                            <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide text-gold-600">
                              half-feat
                            </span>
                          )}
                        </p>
                        {feat.prerequisite && (
                          <p className="text-[10px] italic text-parchment-400">
                            Req: {feat.prerequisite}
                          </p>
                        )}
                        <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-parchment-500">
                          {feat.description}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleSelectFeat(feat)}
                        className="shrink-0 rounded bg-gold-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-gold-700 disabled:opacity-40"
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
                onClick={() => setCustomMode(true)}
                className="mt-3 w-full rounded-control border border-dashed border-parchment-300 px-3 py-1.5 text-xs text-parchment-500 hover:border-parchment-400 hover:bg-white"
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
