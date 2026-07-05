import { useState } from "react";
import { Minus, Plus, Shield } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { GiBleedingWound, GiHealthPotion } from "react-icons/gi";
import type { IconType } from "react-icons";

import { DAMAGE_TYPE_OPTIONS, damageTypeLabel } from "@/lib/damageTypes";

export type HpMode = "damage" | "heal" | "temp";

/** Optional per-apply damage details (#456). */
export interface HpApplyOptions {
  damageType?: string;
  resist?: boolean;
}

// Per-mode segment icon, verb, button tone, and field aria-label.
const HP_MODES: {
  mode: HpMode;
  label: string;
  icon: IconType | LucideIcon;
  verb: string;
  fieldLabel: string;
  buttonClass: string;
}[] = [
  {
    mode: "damage",
    label: "Damage",
    icon: GiBleedingWound,
    verb: "Apply damage",
    fieldLabel: "Damage amount",
    buttonClass: "bg-garnet-700 text-parchment-50 hover:bg-garnet-800",
  },
  {
    mode: "heal",
    label: "Heal",
    icon: GiHealthPotion,
    verb: "Heal",
    fieldLabel: "Heal amount",
    buttonClass: "bg-vitality-700 text-parchment-50 hover:bg-vitality-800",
  },
  {
    mode: "temp",
    label: "Temp HP",
    icon: Shield,
    verb: "Set temp HP",
    fieldLabel: "Temporary hit points",
    buttonClass: "bg-gold-400 text-ink hover:bg-gold-500",
  },
];

export default function HpActionControl({
  pending,
  onApply,
  resistedDamageTypes = [],
}: {
  pending: boolean;
  onApply: (mode: HpMode, value: number, opts?: HpApplyOptions) => Promise<boolean>;
  /** Lowercase damage types the character currently resists (#456). */
  resistedDamageTypes?: string[];
}) {
  const [mode, setMode] = useState<HpMode>("damage");
  const [amount, setAmount] = useState("");
  const [damageType, setDamageType] = useState("");
  // Manual override — default halve on, player can decline (#456).
  const [halve, setHalve] = useState(true);

  const isResisted = damageType !== "" && resistedDamageTypes.includes(damageType);
  const parsedAmount = parseInt(amount, 10) || 0;

  async function apply() {
    const opts: HpApplyOptions =
      mode === "damage"
        ? { damageType: damageType || undefined, resist: isResisted ? halve : undefined }
        : {};
    const ok = await onApply(mode, parseInt(amount, 10), opts);
    if (ok) setAmount("");
  }

  // Step the shared amount by ±1, clamped at 0.
  function stepAmount(delta: number) {
    const next = Math.max(0, (parseInt(amount, 10) || 0) + delta);
    setAmount(String(next));
  }

  const activeMode = HP_MODES.find((m) => m.mode === mode)!;
  const ApplyIcon = activeMode.icon;
  // Temp HP accepts 0 (clears temp); damage/heal require a positive amount.
  const applyDisabled =
    pending || (mode === "temp" ? amount === "" : !amount || parseInt(amount, 10) <= 0);

  return (
    <div className="flex flex-col gap-2">
    <div className="flex flex-wrap items-center gap-3">
      {/* Mode picker */}
      <div
        role="radiogroup"
        aria-label="Hit point action"
        className="inline-flex rounded-control bg-parchment-100 p-0.5"
      >
        {HP_MODES.map(({ mode: m, label, icon: SegIcon }) => {
          const active = m === mode;
          return (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={pending}
              onClick={() => setMode(m)}
              className={`inline-flex items-center gap-1.5 rounded-control px-3 py-1.5 text-sm font-semibold transition-colors disabled:opacity-50 ${
                active
                  ? "bg-parchment-50 text-parchment-900 shadow-card"
                  : "text-parchment-600 hover:text-parchment-900"
              }`}
            >
              <SegIcon aria-hidden="true" className="h-4 w-4" />
              {label}
            </button>
          );
        })}
      </div>

      {/* Stepper */}
      <div className="inline-flex items-center rounded-control border border-parchment-300 bg-parchment-50">
        <button
          type="button"
          disabled={pending}
          onClick={() => stepAmount(-1)}
          aria-label="Decrease amount"
          className="flex h-8 w-8 items-center justify-center rounded-control text-parchment-600 transition-colors hover:bg-parchment-100 disabled:opacity-50"
        >
          <Minus aria-hidden="true" className="h-4 w-4" />
        </button>
        <input
          type="number"
          min={0}
          step={1}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && apply()}
          placeholder="0"
          disabled={pending}
          aria-label={activeMode.fieldLabel}
          className="w-16 border-0 bg-transparent text-center text-lg tabular-nums text-parchment-900 disabled:opacity-50"
        />
        <button
          type="button"
          disabled={pending}
          onClick={() => stepAmount(1)}
          aria-label="Increase amount"
          className="flex h-8 w-8 items-center justify-center rounded-control text-parchment-600 transition-colors hover:bg-parchment-100 disabled:opacity-50"
        >
          <Plus aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>

      {/* Contextual primary action */}
      <button
        type="button"
        disabled={applyDisabled}
        onClick={apply}
        className={`inline-flex items-center gap-1.5 rounded-control px-3 py-1.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:bg-parchment-200 disabled:text-parchment-400 disabled:hover:bg-parchment-200 ${activeMode.buttonClass}`}
      >
        <ApplyIcon aria-hidden="true" className="h-4 w-4" />
        {activeMode.verb}
      </button>
    </div>

      {/* Damage type + resistance override (#456) */}
      {mode === "damage" && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-1.5 text-parchment-600">
            Type
            <select
              value={damageType}
              onChange={(e) => setDamageType(e.target.value)}
              disabled={pending}
              aria-label="Damage type"
              className="rounded-control border border-parchment-300 bg-parchment-50 px-2 py-1 text-parchment-900 disabled:opacity-50"
            >
              <option value="">Untyped</option>
              {DAMAGE_TYPE_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          {isResisted && (
            <label className="flex items-center gap-1.5 font-semibold text-vitality-800">
              <input
                type="checkbox"
                checked={halve}
                onChange={(e) => setHalve(e.target.checked)}
                disabled={pending}
                className="h-3.5 w-3.5 rounded border-parchment-400 text-vitality-700 focus:ring-vitality-600"
              />
              <Shield aria-hidden="true" className="h-3.5 w-3.5" />
              Resistant to {damageTypeLabel(damageType)} — halve
              {halve && parsedAmount > 0 && (
                <span className="tabular-nums text-vitality-700">
                  ({parsedAmount} → {Math.floor(parsedAmount / 2)})
                </span>
              )}
            </label>
          )}
        </div>
      )}
    </div>
  );
}
