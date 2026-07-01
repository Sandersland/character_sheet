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

import { useEffect, useRef, useState } from "react";

import { fetchFeats } from "@/api/client";
import Spinner from "@/components/ui/Spinner";
import { useAsiDraft } from "@/features/advancement/useAsiDraft";
import { useDelayedFlag } from "@/hooks/useDelayedFlag";
import { ABILITY_OPTIONS, abilityLabel, skillLabel } from "@/lib/abilities";
import type {
  AdvancementOperation,
  CatalogFeat,
  FeatImprovement,
} from "@/types/character";

const ABILITY_CAP = 20;

const NUMERIC_TARGETS: { value: string; label: string }[] = [
  { value: "speed", label: "Speed" },
  { value: "maxHp", label: "Max HP" },
  { value: "armorClass", label: "Armor Class" },
  { value: "initiative", label: "Initiative" },
];

interface StatBonusRow {
  id: number;
  target: string;
  amount: number;
  perLevel: boolean;
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
  const [catalog, setCatalog] = useState<CatalogFeat[] | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedFeat, setSelectedFeat] = useState<CatalogFeat | null>(null);
  const [abilityChoice, setAbilityChoice] = useState("");
  const [customMode, setCustomMode] = useState(false);
  const hasFetched = useRef(false);
  const showSpinner = useDelayedFlag(open && catalog === null && !catalogError);

  // ── Custom feat form state ─────────────────────────────────────────────────
  const [customName, setCustomName] = useState("");
  const [customDesc, setCustomDesc] = useState("");
  // Numeric stat bonus rows
  const nextRowId = useRef(0);
  const [statBonuses, setStatBonuses] = useState<StatBonusRow[]>([]);
  // Skill proficiencies
  const [grantedSkills, setGrantedSkills] = useState<Set<string>>(new Set());
  // Saving throw proficiencies
  const [grantedSaves, setGrantedSaves] = useState<Set<string>>(new Set());
  // Ability increase (half-feat style)
  const [abilityOptions, setAbilityOptions] = useState<Set<string>>(new Set());
  const [abilityIncrease, setAbilityIncrease] = useState(1);
  const [customAbilityChoice, setCustomAbilityChoice] = useState("");

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
  function handleAsiSubmit() {
    if (asi.totalPoints !== 2) return;
    onSubmit(asi.buildOperation());
    asi.reset();
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

  // ── Custom feat helpers ────────────────────────────────────────────────────

  function addStatBonus() {
    const id = nextRowId.current++;
    setStatBonuses([...statBonuses, { id, target: "speed", amount: 0, perLevel: false }]);
  }

  function updateStatBonus(id: number, patch: Partial<StatBonusRow>) {
    setStatBonuses(statBonuses.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function removeStatBonus(id: number) {
    setStatBonuses(statBonuses.filter((r) => r.id !== id));
  }

  function toggleSkill(name: string) {
    const next = new Set(grantedSkills);
    if (next.has(name)) next.delete(name); else next.add(name);
    setGrantedSkills(next);
  }

  function toggleSave(ability: string) {
    const next = new Set(grantedSaves);
    if (next.has(ability)) next.delete(ability); else next.add(ability);
    setGrantedSaves(next);
  }

  function toggleAbilityOption(key: string) {
    const next = new Set(abilityOptions);
    if (next.has(key)) next.delete(key); else next.add(key);
    setAbilityOptions(next);
    // Clear choice if it's no longer a valid option
    if (next.size <= 1) setCustomAbilityChoice("");
  }

  function resetCustomForm() {
    setCustomName("");
    setCustomDesc("");
    setStatBonuses([]);
    setGrantedSkills(new Set());
    setGrantedSaves(new Set());
    setAbilityOptions(new Set());
    setAbilityIncrease(1);
    setCustomAbilityChoice("");
  }

  function handleFeatSubmit() {
    if (customMode) {
      if (!customName.trim()) return;

      // Build improvements from stat bonuses, skill profs, saving throw profs
      const improvements: FeatImprovement[] = [
        ...statBonuses
          .filter((r) => r.amount > 0)
          .map((r): FeatImprovement => ({
            target: r.target,
            amount: r.amount,
            ...(r.perLevel ? { perLevel: true } : {}),
          })),
        ...Array.from(grantedSkills).map((name): FeatImprovement => ({ target: "skillProficiency", amount: 1, key: name })),
        ...Array.from(grantedSaves).map((ability): FeatImprovement => ({ target: "savingThrowProficiency", amount: 1, key: ability })),
      ];

      const abilityOptionsArr = Array.from(abilityOptions);
      // If a half-feat ability bump is configured, determine the choice
      const needsChoice = abilityOptionsArr.length > 1;
      const chosenAbility = abilityOptionsArr.length === 1 ? abilityOptionsArr[0] : customAbilityChoice;
      if (needsChoice && !chosenAbility) return; // guard: choice required

      onSubmit({
        type: "takeFeat",
        custom: {
          name: customName.trim(),
          description: customDesc,
          improvements: improvements.length > 0 ? improvements : undefined,
          abilityOptions: abilityOptionsArr.length > 0 ? abilityOptionsArr : undefined,
          abilityIncrease: abilityOptionsArr.length > 0 ? abilityIncrease : undefined,
        },
        abilityChoice: abilityOptionsArr.length > 0 ? chosenAbility : undefined,
      });
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
    resetCustomForm();
    setOpen(false);
  }

  // Disable custom feat submit: needs a name, and if ability increase configured with
  // multiple options, a choice must be made. Stat bonuses with amount 0 are ignored.
  const abilityOptionsArr = Array.from(abilityOptions);
  const needsCustomAbilityChoice = abilityOptionsArr.length > 1 && !customAbilityChoice;
  const customSubmitDisabled = !customName.trim() || needsCustomAbilityChoice || busy;

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
          onClick={() => { setOpen(false); asi.reset(); setSelectedFeat(null); setCustomMode(false); resetCustomForm(); }}
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
                onClick={() => { setSelectedFeat(null); setAbilityChoice(""); }}
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
                    onChange={(e) => setAbilityChoice(e.target.value)}
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
                onClick={() => { setCustomMode(false); resetCustomForm(); }}
                className="mb-3 text-xs text-parchment-600 hover:text-parchment-800"
              >
                ← Back to list
              </button>

              {/* Name + description */}
              <div className="flex flex-col gap-2">
                <input
                  type="text"
                  placeholder="Feat name"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  className="w-full rounded-control border border-parchment-300 bg-parchment-50 px-2.5 py-1.5 text-sm text-parchment-900 placeholder:text-parchment-400 focus:border-gold-500 focus:outline-none"
                />
                <textarea
                  placeholder="Description (optional)"
                  value={customDesc}
                  onChange={(e) => setCustomDesc(e.target.value)}
                  rows={2}
                  className="w-full rounded-control border border-parchment-300 bg-parchment-50 px-2.5 py-1.5 text-sm text-parchment-900 placeholder:text-parchment-400 focus:border-gold-500 focus:outline-none"
                />
              </div>

              {/* ── Stat bonuses ── */}
              <div className="mt-4">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-parchment-600">
                  Stat Bonuses
                </p>
                {statBonuses.length > 0 && (
                  <div className="mb-2 flex flex-col gap-2">
                    {statBonuses.map((row) => (
                      <div key={row.id} className="flex items-center gap-2">
                        <select
                          value={row.target}
                          onChange={(e) => updateStatBonus(row.id, { target: e.target.value })}
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
                          onChange={(e) => updateStatBonus(row.id, { amount: Math.max(0, parseInt(e.target.value) || 0) })}
                          className="w-16 rounded-control border border-parchment-300 bg-parchment-50 px-2 py-1 text-xs text-parchment-900 focus:border-gold-500 focus:outline-none"
                          placeholder="0"
                        />
                        <label className="flex items-center gap-1 text-[11px] text-parchment-600">
                          <input
                            type="checkbox"
                            checked={row.perLevel}
                            onChange={(e) => updateStatBonus(row.id, { perLevel: e.target.checked })}
                            className="rounded-sm"
                          />
                          /level
                        </label>
                        <button
                          type="button"
                          onClick={() => removeStatBonus(row.id)}
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
                  onClick={addStatBonus}
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
                        checked={grantedSkills.has(name)}
                        onChange={() => toggleSkill(name)}
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
                        checked={grantedSaves.has(key)}
                        onChange={() => toggleSave(key)}
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
                        checked={abilityOptions.has(key)}
                        onChange={() => toggleAbilityOption(key)}
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
                      value={abilityIncrease}
                      onChange={(e) => setAbilityIncrease(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-16 rounded-control border border-parchment-300 bg-parchment-50 px-2 py-1 text-xs text-parchment-900 focus:border-gold-500 focus:outline-none"
                    />
                  </label>
                )}
                {/* Player choice picker — only shown when taking the feat and >1 option */}
                {abilityOptionsArr.length > 1 && (
                  <div className="mt-2">
                    <label className="mb-1 block text-xs font-semibold text-parchment-700">
                      Choose +{abilityIncrease} to:
                    </label>
                    <select
                      value={customAbilityChoice}
                      onChange={(e) => setCustomAbilityChoice(e.target.value)}
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
                    +{abilityIncrease} to {abilityLabel(abilityOptionsArr[0])} will be applied automatically.
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
                onChange={(e) => setSearch(e.target.value)}
                className="mb-3 w-full rounded-control border border-parchment-300 bg-parchment-50 px-2.5 py-1.5 text-sm text-parchment-900 placeholder:text-parchment-400 focus:border-gold-500 focus:outline-none"
              />
              {catalogError && (
                <p className="text-xs text-garnet-700">{catalogError}</p>
              )}
              {catalog === null && !catalogError && showSpinner && <Spinner />}
              {catalog !== null && filteredCatalog.length === 0 && (
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
                        onClick={() => handleSelectFeat(feat)}
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
                onClick={() => setCustomMode(true)}
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
