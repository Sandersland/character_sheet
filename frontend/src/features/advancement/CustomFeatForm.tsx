import type { CustomFeatDraft } from "@/features/advancement/useCustomFeatDraft";
import { ABILITY_OPTIONS, abilityLabel, skillLabel } from "@/lib/abilities";

const NUMERIC_TARGETS: { value: string; label: string }[] = [
  { value: "speed", label: "Speed" },
  { value: "maxHp", label: "Max HP" },
  { value: "armorClass", label: "Armor Class" },
  { value: "initiative", label: "Initiative" },
];

interface Props {
  currentScores: Record<string, number>;
  skillNames: string[];
  busy: boolean;
  custom: CustomFeatDraft;
  onBack: () => void;
  onSubmit: () => void;
}

export default function CustomFeatForm({ currentScores, skillNames, busy, custom, onBack, onSubmit }: Props) {
  const abilityOptionsArr = Array.from(custom.abilityOptions);

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
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
        disabled={custom.submitDisabled(busy)}
        onClick={onSubmit}
        className="mt-4 w-full rounded-control bg-gold-400 px-4 py-2 text-sm font-semibold text-ink hover:bg-gold-500 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Add custom feat
      </button>
    </div>
  );
}
