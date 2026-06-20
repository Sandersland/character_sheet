/**
 * AddSpellPanel — inline expand-in-place panel for learning a new spell.
 * Two tabs: catalog picker (from GET /api/spells) and custom-spell form.
 * Mirrors AddItemPanel in structure. Not a modal — see CLAUDE.md on why
 * the overlay primitive is reserved for read-only review surfaces.
 */

import { useEffect, useState } from "react";

import { fetchSpells } from "../api/client";
import type {
  CatalogSpell,
  CustomSpellInput,
  LearnSpellOperation,
  SpellSchool,
} from "../types/character";

interface AddSpellPanelProps {
  /** Called with the op to send; parent batches and fires the API. */
  onLearn: (op: LearnSpellOperation) => void;
  onClose: () => void;
  busy: boolean;
  /** Set of spellId values already in the spellbook (to disable duplicates). */
  learnedSpellIds: Set<string>;
}

// Spell levels as filter options.
const LEVEL_OPTIONS = [
  { value: "", label: "All levels" },
  { value: "0", label: "Cantrips" },
  { value: "1", label: "1st level" },
  { value: "2", label: "2nd level" },
  { value: "3", label: "3rd level" },
  { value: "4", label: "4th level" },
  { value: "5", label: "5th level" },
  { value: "6", label: "6th level" },
  { value: "7", label: "7th level" },
  { value: "8", label: "8th level" },
  { value: "9", label: "9th level" },
];

const SPELL_SCHOOLS: SpellSchool[] = [
  "abjuration", "conjuration", "divination", "enchantment",
  "evocation", "illusion", "necromancy", "transmutation",
];

const BLANK_CUSTOM: CustomSpellInput = {
  name: "",
  level: 0,
  school: "evocation",
  castingTime: "1 action",
  range: "60 ft",
  duration: "Instantaneous",
  description: "",
};

export default function AddSpellPanel({ onLearn, onClose, busy, learnedSpellIds }: AddSpellPanelProps) {
  const [tab, setTab] = useState<"catalog" | "custom">("catalog");

  // Catalog tab
  const [catalog, setCatalog] = useState<CatalogSpell[] | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState("");

  // Custom tab
  const [custom, setCustom] = useState<CustomSpellInput>(BLANK_CUSTOM);
  const [hasEffect, setHasEffect] = useState(false);

  // Load catalog once on first render.
  useEffect(() => {
    let mounted = true;
    fetchSpells()
      .then((spells) => { if (mounted) setCatalog(spells); })
      .catch(() => { if (mounted) setCatalogError("Couldn't load spell catalog."); });
    return () => { mounted = false; };
  }, []);

  // Catalog filtering
  const filteredCatalog = (catalog ?? []).filter((s) => {
    if (levelFilter && String(s.level) !== levelFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!s.name.toLowerCase().includes(q) && !s.school.includes(q)) return false;
    }
    return true;
  });

  function handleCatalogLearn(spell: CatalogSpell) {
    onLearn({ type: "learnSpell", spellId: spell.id });
  }

  function handleCustomLearn(e: React.FormEvent) {
    e.preventDefault();
    if (!custom.name.trim()) return;
    const payload: CustomSpellInput = {
      name: custom.name.trim(),
      level: custom.level,
      school: custom.school,
      castingTime: custom.castingTime,
      range: custom.range,
      duration: custom.duration,
      description: custom.description,
      concentration: custom.concentration,
      ritual: custom.ritual,
    };
    if (hasEffect && custom.effectKind) {
      payload.effectKind = custom.effectKind;
      payload.effectDiceCount = custom.effectDiceCount;
      payload.effectDiceFaces = custom.effectDiceFaces;
      payload.effectModifier = custom.effectModifier;
      payload.damageType = custom.damageType;
      payload.attackType = custom.attackType;
      payload.saveAbility = custom.saveAbility;
      payload.upcastDicePerLevel = custom.upcastDicePerLevel;
      payload.cantripScaling = custom.cantripScaling;
    }
    onLearn({ type: "learnSpell", custom: payload });
  }

  const inputCls = "w-full rounded-[var(--radius-control)] border border-[var(--color-parchment-300)] bg-white px-2.5 py-1.5 text-sm text-[var(--color-parchment-900)] placeholder:text-[var(--color-parchment-400)] focus:border-[var(--color-arcane-500)] focus:outline-none";
  const labelCls = "block text-xs font-semibold text-[var(--color-parchment-700)]";

  return (
    <div className="mt-3 rounded-[var(--radius-card)] border border-[var(--color-arcane-200)] bg-[var(--color-arcane-50)] p-4">
      {/* Panel header */}
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--color-arcane-900)]">Learn a Spell</h3>
        <button
          type="button"
          onClick={onClose}
          className="text-[var(--color-parchment-400)] hover:text-[var(--color-parchment-700)]"
          aria-label="Close add spell panel"
        >
          ✕
        </button>
      </div>

      {/* Tab switcher */}
      <div className="mb-4 flex gap-2 border-b border-[var(--color-arcane-200)] pb-2">
        {(["catalog", "custom"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-3 py-1 text-xs font-semibold transition-colors ${
              tab === t
                ? "border-b-2 border-[var(--color-arcane-600)] text-[var(--color-arcane-800)]"
                : "text-[var(--color-parchment-500)] hover:text-[var(--color-parchment-800)]"
            }`}
          >
            {t === "catalog" ? "From catalog" : "Custom spell"}
          </button>
        ))}
      </div>

      {/* ── Catalog tab ── */}
      {tab === "catalog" && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <input
              type="search"
              placeholder="Search by name or school…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={`${inputCls} flex-1 min-w-[140px]`}
            />
            <select
              value={levelFilter}
              onChange={(e) => setLevelFilter(e.target.value)}
              className={`${inputCls} w-auto`}
            >
              {LEVEL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {catalogError && (
            <p className="text-xs text-[var(--color-garnet-700)]">{catalogError}</p>
          )}
          {catalog === null && !catalogError && (
            <p className="text-xs text-[var(--color-parchment-500)]">Loading…</p>
          )}
          {catalog !== null && filteredCatalog.length === 0 && (
            <p className="py-2 text-center text-xs text-[var(--color-parchment-500)]">No spells match your filter.</p>
          )}

          <ul className="max-h-[320px] overflow-y-auto">
            {filteredCatalog.map((spell) => {
              const alreadyKnown = learnedSpellIds.has(spell.id);
              return (
                <li
                  key={spell.id}
                  className="flex items-center justify-between gap-3 border-b border-[var(--color-arcane-100)] py-2 last:border-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[var(--color-parchment-900)]">
                      {spell.name}
                    </p>
                    <p className="text-xs text-[var(--color-parchment-500)]">
                      {spell.level === 0 ? "Cantrip" : `Level ${spell.level}`} · {spell.school}
                      {spell.concentration && " · conc"}
                      {spell.ritual && " · ritual"}
                    </p>
                    {spell.effectKind && (
                      <p className="text-xs text-[var(--color-arcane-700)]">
                        {spell.effectKind === "heal" ? "Healing" : `${spell.damageType ?? ""} damage`}
                        {" — "}
                        {spell.effectDiceCount}d{spell.effectDiceFaces}
                        {spell.effectModifier ? ` + ${spell.effectModifier}` : ""}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={busy || alreadyKnown}
                    onClick={() => handleCatalogLearn(spell)}
                    className="shrink-0 rounded bg-[var(--color-arcane-600)] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[var(--color-arcane-700)] disabled:cursor-not-allowed disabled:opacity-40"
                    title={alreadyKnown ? "Already in your spellbook" : `Learn ${spell.name}`}
                  >
                    {alreadyKnown ? "Known" : "Learn"}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* ── Custom spell tab ── */}
      {tab === "custom" && (
        <form onSubmit={handleCustomLearn} className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={labelCls} htmlFor="custom-name">Spell name *</label>
              <input
                id="custom-name"
                required
                className={inputCls}
                value={custom.name}
                onChange={(e) => setCustom((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Eldritch Blast"
              />
            </div>

            <div>
              <label className={labelCls} htmlFor="custom-level">Level</label>
              <select
                id="custom-level"
                className={inputCls}
                value={custom.level}
                onChange={(e) => setCustom((p) => ({ ...p, level: Number(e.target.value) }))}
              >
                <option value={0}>Cantrip</option>
                {[1,2,3,4,5,6,7,8,9].map((l) => <option key={l} value={l}>Level {l}</option>)}
              </select>
            </div>

            <div>
              <label className={labelCls} htmlFor="custom-school">School</label>
              <select
                id="custom-school"
                className={inputCls}
                value={custom.school}
                onChange={(e) => setCustom((p) => ({ ...p, school: e.target.value as SpellSchool }))}
              >
                {SPELL_SCHOOLS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div>
              <label className={labelCls} htmlFor="custom-casting-time">Casting time</label>
              <input
                id="custom-casting-time"
                className={inputCls}
                value={custom.castingTime}
                onChange={(e) => setCustom((p) => ({ ...p, castingTime: e.target.value }))}
                placeholder="1 action"
              />
            </div>

            <div>
              <label className={labelCls} htmlFor="custom-range">Range</label>
              <input
                id="custom-range"
                className={inputCls}
                value={custom.range}
                onChange={(e) => setCustom((p) => ({ ...p, range: e.target.value }))}
                placeholder="60 ft"
              />
            </div>

            <div>
              <label className={labelCls} htmlFor="custom-duration">Duration</label>
              <input
                id="custom-duration"
                className={inputCls}
                value={custom.duration}
                onChange={(e) => setCustom((p) => ({ ...p, duration: e.target.value }))}
                placeholder="Instantaneous"
              />
            </div>

            <div className="flex gap-4">
              <label className="flex items-center gap-1.5 text-xs text-[var(--color-parchment-700)]">
                <input
                  type="checkbox"
                  checked={!!custom.concentration}
                  onChange={(e) => setCustom((p) => ({ ...p, concentration: e.target.checked }))}
                />
                Concentration
              </label>
              <label className="flex items-center gap-1.5 text-xs text-[var(--color-parchment-700)]">
                <input
                  type="checkbox"
                  checked={!!custom.ritual}
                  onChange={(e) => setCustom((p) => ({ ...p, ritual: e.target.checked }))}
                />
                Ritual
              </label>
            </div>

            <div className="sm:col-span-2">
              <label className={labelCls} htmlFor="custom-description">Description</label>
              <textarea
                id="custom-description"
                rows={3}
                className={`${inputCls} resize-y`}
                value={custom.description}
                onChange={(e) => setCustom((p) => ({ ...p, description: e.target.value }))}
                placeholder="What does this spell do?"
              />
            </div>
          </div>

          {/* Optional effect fields (enables auto-rolling on cast) */}
          <div className="rounded-[var(--radius-control)] border border-[var(--color-arcane-200)] p-3">
            <label className="mb-2 flex items-center gap-2 text-xs font-semibold text-[var(--color-arcane-800)]">
              <input
                type="checkbox"
                checked={hasEffect}
                onChange={(e) => setHasEffect(e.target.checked)}
              />
              Enable auto-rolling on cast
            </label>
            {hasEffect && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div>
                  <label className={labelCls}>Effect kind</label>
                  <select
                    className={inputCls}
                    value={custom.effectKind ?? ""}
                    onChange={(e) => setCustom((p) => ({ ...p, effectKind: e.target.value as "damage" | "heal" || undefined }))}
                  >
                    <option value="">— none —</option>
                    <option value="damage">Damage</option>
                    <option value="heal">Healing</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Dice count</label>
                  <input type="number" min={1} className={inputCls} value={custom.effectDiceCount ?? ""} onChange={(e) => setCustom((p) => ({ ...p, effectDiceCount: Number(e.target.value) || undefined }))} placeholder="e.g. 8" />
                </div>
                <div>
                  <label className={labelCls}>Dice faces</label>
                  <input type="number" min={2} className={inputCls} value={custom.effectDiceFaces ?? ""} onChange={(e) => setCustom((p) => ({ ...p, effectDiceFaces: Number(e.target.value) || undefined }))} placeholder="e.g. 6" />
                </div>
                <div>
                  <label className={labelCls}>Flat modifier</label>
                  <input type="number" className={inputCls} value={custom.effectModifier ?? ""} onChange={(e) => setCustom((p) => ({ ...p, effectModifier: e.target.value === "" ? undefined : Number(e.target.value) }))} placeholder="0" />
                </div>
                {custom.effectKind === "damage" && (
                  <>
                    <div>
                      <label className={labelCls}>Damage type</label>
                      <input className={inputCls} value={custom.damageType ?? ""} onChange={(e) => setCustom((p) => ({ ...p, damageType: e.target.value || undefined }))} placeholder="fire" />
                    </div>
                    <div>
                      <label className={labelCls}>Attack type</label>
                      <select className={inputCls} value={custom.attackType ?? ""} onChange={(e) => setCustom((p) => ({ ...p, attackType: e.target.value as "attack" | "save" || undefined }))}>
                        <option value="">— none —</option>
                        <option value="attack">Spell attack</option>
                        <option value="save">Saving throw</option>
                      </select>
                    </div>
                    {custom.attackType === "save" && (
                      <div>
                        <label className={labelCls}>Save ability</label>
                        <input className={inputCls} value={custom.saveAbility ?? ""} onChange={(e) => setCustom((p) => ({ ...p, saveAbility: e.target.value || undefined }))} placeholder="dexterity" />
                      </div>
                    )}
                  </>
                )}
                <div>
                  <label className={labelCls}>Upcast dice/level</label>
                  <input type="number" min={0} className={inputCls} value={custom.upcastDicePerLevel ?? ""} onChange={(e) => setCustom((p) => ({ ...p, upcastDicePerLevel: Number(e.target.value) || undefined }))} placeholder="0" />
                </div>
                {custom.level === 0 && (
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1.5 text-xs text-[var(--color-parchment-700)]">
                      <input type="checkbox" checked={!!custom.cantripScaling} onChange={(e) => setCustom((p) => ({ ...p, cantripScaling: e.target.checked }))} />
                      Cantrip scaling
                    </label>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-[var(--radius-control)] px-3 py-1.5 text-xs font-semibold text-[var(--color-parchment-600)] hover:text-[var(--color-parchment-900)]">
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !custom.name.trim()}
              className="rounded-[var(--radius-control)] bg-[var(--color-arcane-600)] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[var(--color-arcane-700)] disabled:opacity-40"
            >
              {busy ? "Saving…" : "Add custom spell"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
