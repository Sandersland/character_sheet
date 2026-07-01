import { useState } from "react";
import { Minus, Plus, Shield } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { GiBleedingWound, GiHealthPotion } from "react-icons/gi";
import type { IconType } from "react-icons";

export type HpMode = "damage" | "heal" | "temp";

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
}: {
  pending: boolean;
  onApply: (mode: HpMode, value: number) => Promise<boolean>;
}) {
  const [mode, setMode] = useState<HpMode>("damage");
  const [amount, setAmount] = useState("");

  async function apply() {
    const ok = await onApply(mode, parseInt(amount, 10));
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
  );
}
