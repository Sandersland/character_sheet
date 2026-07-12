import { useState } from "react";
import { Minus, Plus } from "lucide-react";

import { DAMAGE_TYPES, damageTypeLabel } from "@/lib/damageTypes";
import {
  ACCUMULATOR_CHIPS,
  accumulateAmount,
  projectHp,
  type HpMode,
  type HpSnapshot,
} from "@/lib/hpAmount";
import Segmented from "@/components/ui/Segmented";

export type { HpMode };

/** Optional metadata for a damage apply — the type and whether to auto-halve (#456). */
export interface DamageMeta {
  damageType?: string;
  applyResistance?: boolean;
}

// Per-mode field aria-label + Apply button tone/label.
const HP_MODES: Record<
  HpMode,
  { label: string; fieldLabel: string; buttonClass: string; applyLabel: (n: number) => string }
> = {
  damage: {
    label: "Damage",
    fieldLabel: "Damage amount",
    buttonClass: "bg-garnet-700 text-parchment-50 hover:bg-garnet-800",
    applyLabel: (n) => `Apply ${n} damage`,
  },
  heal: {
    label: "Heal",
    fieldLabel: "Heal amount",
    buttonClass: "bg-vitality-700 text-parchment-50 hover:bg-vitality-800",
    applyLabel: (n) => `Heal ${n}`,
  },
  temp: {
    label: "Temp HP",
    fieldLabel: "Temporary hit points",
    buttonClass: "bg-gold-400 text-ink hover:bg-gold-500",
    applyLabel: (n) => `Grant ${n} temp HP`,
  },
};

const MODE_OPTIONS = (Object.keys(HP_MODES) as HpMode[]).map((mode) => ({
  value: mode,
  label: HP_MODES[mode].label,
}));

export default function HpActionControl({
  pending,
  hitPoints,
  onApply,
  resistedTypes = [],
}: {
  pending: boolean;
  hitPoints: HpSnapshot;
  onApply: (mode: HpMode, value: number, damage?: DamageMeta) => Promise<boolean>;
  /** Damage types the character currently resists (drives the auto-halve preview) (#456). */
  resistedTypes?: string[];
}) {
  const [mode, setMode] = useState<HpMode>("damage");
  const [amount, setAmount] = useState("");
  const [damageType, setDamageType] = useState("");
  const [applyResistance, setApplyResistance] = useState(true);

  const numericAmount = parseInt(amount, 10) || 0;
  // A halve preview shows only when the chosen type is actively resisted (#456).
  const isResisted = mode === "damage" && damageType !== "" && resistedTypes.includes(damageType);
  const halved = Math.floor(numericAmount / 2);
  // Project the damage the backend will actually apply after auto-halving (#456).
  const effectiveAmount = isResisted && applyResistance ? halved : numericAmount;

  const active = HP_MODES[mode];
  const applyDisabled = pending || numericAmount <= 0;

  async function apply() {
    const damageMeta: DamageMeta | undefined =
      mode === "damage" ? { damageType: damageType || undefined, applyResistance } : undefined;
    const ok = await onApply(mode, numericAmount, damageMeta);
    if (ok) setAmount("");
  }

  // Chips/stepper build the amount; clamped 0–999.
  function bumpAmount(delta: number) {
    setAmount(String(accumulateAmount(numericAmount, delta)));
  }

  return (
    <div className="flex flex-col gap-3">
      <Segmented
        options={MODE_OPTIONS}
        value={mode}
        onChange={setMode}
        label="Hit point action"
      />

      {/* Amount readout + projected result */}
      <div className="flex flex-col items-center gap-1">
        <span className="text-4xl font-bold tabular-nums text-parchment-900">{numericAmount}</span>
        <p aria-live="polite" className="text-sm font-semibold text-parchment-600">
          {projectHp(mode, effectiveAmount, hitPoints)}
        </p>
      </div>

      {/* Accumulator chips */}
      <div className="flex flex-wrap justify-center gap-2">
        {ACCUMULATOR_CHIPS.map((step) => (
          <button
            key={step}
            type="button"
            disabled={pending}
            onClick={() => bumpAmount(step)}
            aria-label={`Add ${step}`}
            className="min-w-12 rounded-full border border-parchment-300 bg-parchment-50 px-3 py-1.5 text-base font-semibold text-parchment-800 transition-colors hover:bg-parchment-200 disabled:opacity-50"
          >
            +{step}
          </button>
        ))}
        <button
          type="button"
          disabled={pending || numericAmount === 0}
          onClick={() => setAmount("")}
          aria-label="Clear amount"
          className="min-w-12 rounded-full border border-parchment-300 bg-parchment-50 px-3 py-1.5 text-base font-semibold text-parchment-600 transition-colors hover:bg-parchment-200 disabled:opacity-50"
        >
          Clear
        </button>
      </div>

      {/* Secondary stepper + direct entry */}
      <div className="flex justify-center">
        <div className="inline-flex items-center rounded-control border border-parchment-300 bg-parchment-50">
          <button
            type="button"
            disabled={pending}
            onClick={() => bumpAmount(-1)}
            aria-label="Decrease amount"
            className="flex h-9 w-9 items-center justify-center rounded-control text-parchment-600 transition-colors hover:bg-parchment-100 disabled:opacity-50"
          >
            <Minus aria-hidden="true" className="h-4 w-4" />
          </button>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !applyDisabled && apply()}
            placeholder="0"
            disabled={pending}
            aria-label={active.fieldLabel}
            className="w-16 border-0 bg-transparent text-center text-lg tabular-nums text-parchment-900 disabled:opacity-50"
          />
          <button
            type="button"
            disabled={pending}
            onClick={() => bumpAmount(1)}
            aria-label="Increase amount"
            className="flex h-9 w-9 items-center justify-center rounded-control text-parchment-600 transition-colors hover:bg-parchment-100 disabled:opacity-50"
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Damage-type picker (damage mode only, optional) (#456) */}
      {mode === "damage" && (
        <select
          value={damageType}
          onChange={(e) => setDamageType(e.target.value)}
          disabled={pending}
          aria-label="Damage type"
          className="h-9 rounded-control border border-parchment-300 bg-parchment-50 px-2 text-base text-parchment-900 disabled:opacity-50"
        >
          <option value="">Typeless</option>
          {DAMAGE_TYPES.map((t) => (
            <option key={t} value={t}>
              {damageTypeLabel(t)}
            </option>
          ))}
        </select>
      )}

      {/* Resistance auto-halve preview + decline override (#456) */}
      {isResisted && (
        <label className="flex items-center gap-2 text-xs text-parchment-600">
          <input
            type="checkbox"
            checked={applyResistance}
            onChange={(e) => setApplyResistance(e.target.checked)}
            disabled={pending}
            className="h-3.5 w-3.5 rounded border-parchment-400 text-arcane-700 focus:ring-arcane-600"
          />
          <span role="status" aria-live="polite">
            {applyResistance
              ? `Resistant to ${damageTypeLabel(damageType)} — ${numericAmount} halves to ${halved}`
              : `Resistance to ${damageTypeLabel(damageType)} declined — taking full ${numericAmount}`}
          </span>
        </label>
      )}

      {/* Full-width primary action echoing the pending amount */}
      <button
        type="button"
        disabled={applyDisabled}
        onClick={apply}
        className={`w-full rounded-control px-3 py-2.5 text-base font-semibold transition-colors disabled:cursor-not-allowed disabled:bg-parchment-200 disabled:text-parchment-400 disabled:hover:bg-parchment-200 ${active.buttonClass}`}
      >
        {active.applyLabel(numericAmount)}
      </button>
    </div>
  );
}
