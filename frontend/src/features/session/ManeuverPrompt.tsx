// attackOption/reaction/effect-placement maneuvers are handled by
// AttackOptionSection, not here.
// Gold styling marks resources in the design system.

import { useState } from "react";

import { useManeuverDie } from "@/features/session/useManeuverDie";
import { canPromptManeuvers, planManeuverPrompt, resolveDamageSelection } from "@/lib/maneuverPrompt";
import { useCurrentCharacter } from "@/hooks/CurrentCharacterProvider";
import type { ManeuverEntry } from "@/types/character";
import type { RollResult } from "@/lib/dice";

interface ManeuverPromptProps {
  section: "attack" | "damage";
  lastAttackRoll: RollResult | null;
  lastDamageRoll: RollResult | null;
  /** Pass null for whichever total wasn't changed by this spend. */
  onRollsUpdated: (newAttackTotal: number | null, newDamageTotal: number | null) => void;
}

export default function ManeuverPrompt({
  section,
  lastAttackRoll,
  lastDamageRoll,
  onRollsUpdated,
}: ManeuverPromptProps) {
  const { character } = useCurrentCharacter();
  const { pool, dieLabel, busy, spend } = useManeuverDie(character);
  const [spentFor, setSpentFor] = useState<string | null>(null);
  const [selectedDamageManeuver, setSelectedDamageManeuver] = useState("");

  const maneuversKnown = character.resources?.maneuversKnown ?? [];

  // The explicit !pool check narrows the type; canPromptManeuvers owns the full gating rule.
  if (!pool || !canPromptManeuvers(pool, maneuversKnown)) {
    return null;
  }

  const plan = planManeuverPrompt(maneuversKnown, lastAttackRoll !== null, lastDamageRoll !== null);
  const show = section === "attack" ? plan.showAttackSection : plan.showDamageSection;
  if (!show) {
    return null;
  }

  const activeDamageManeuver = resolveDamageSelection(plan.damageRollManeuvers, selectedDamageManeuver);

  async function handlePrecision(m: ManeuverEntry) {
    if (busy || !lastAttackRoll) return;
    const dieResult = await spend(m.id);
    setSpentFor(m.name);
    onRollsUpdated(lastAttackRoll.total + dieResult, null);
  }

  async function handleDamage(m: ManeuverEntry) {
    if (busy || !lastDamageRoll) return;
    const dieResult = await spend(m.id);
    setSpentFor(m.name);
    onRollsUpdated(null, lastDamageRoll.total + dieResult);
  }

  return (
    <div className="mt-1.5 flex flex-col gap-1.5 rounded-control border border-gold-200 bg-gold-50 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gold-800">
        Superiority Die ({dieLabel}, {pool.remaining} left)
      </p>

      {section === "attack" ? (
        <AttackManeuverSection
          maneuvers={plan.attackRollManeuvers}
          dieLabel={dieLabel}
          busy={busy}
          spentFor={spentFor}
          onSpend={handlePrecision}
        />
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-gold-800">Add to Damage:</span>
          <DamageManeuverPicker
            maneuvers={plan.damageRollManeuvers}
            dieLabel={dieLabel}
            busy={busy}
            spentFor={spentFor}
            active={activeDamageManeuver}
            onSelect={setSelectedDamageManeuver}
            onSpend={handleDamage}
          />
        </div>
      )}
    </div>
  );
}

function AttackManeuverSection({
  maneuvers,
  dieLabel,
  busy,
  spentFor,
  onSpend,
}: {
  maneuvers: ManeuverEntry[];
  dieLabel: string;
  busy: boolean;
  spentFor: string | null;
  onSpend: (m: ManeuverEntry) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gold-800">Add to Attack:</span>
      {maneuvers.map((m) => (
        <SpendButton key={m.id} disabled={busy || spentFor === m.name} onClick={() => onSpend(m)}>
          {m.name} +{dieLabel}
        </SpendButton>
      ))}
    </div>
  );
}

function SpendButton({
  disabled,
  onClick,
  children,
}: {
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-control border border-gold-300 bg-gold-100 px-2 py-0.5 text-xs font-semibold text-gold-800 transition-colors hover:bg-gold-200 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function DamageManeuverPicker({
  maneuvers,
  dieLabel,
  busy,
  spentFor,
  active,
  onSelect,
  onSpend,
}: {
  maneuvers: ManeuverEntry[];
  dieLabel: string;
  busy: boolean;
  spentFor: string | null;
  active: string;
  onSelect: (name: string) => void;
  onSpend: (m: ManeuverEntry) => void;
}) {
  if (maneuvers.length === 1) {
    return (
      <SpendButton disabled={busy || spentFor === maneuvers[0].name} onClick={() => onSpend(maneuvers[0])}>
        {maneuvers[0].name} +{dieLabel}
      </SpendButton>
    );
  }
  return (
    <>
      <select
        value={active}
        onChange={(e) => onSelect(e.target.value)}
        disabled={busy}
        className="rounded-control border border-gold-300 bg-parchment-50 px-1.5 py-0.5 text-xs text-parchment-800 focus:outline-none focus:ring-1 focus:ring-gold-400"
        aria-label="Select maneuver to add to damage"
      >
        {maneuvers.map((m) => (
          <option key={m.id} value={m.name}>
            {m.name}
          </option>
        ))}
      </select>
      <SpendButton
        disabled={busy || !active || spentFor === active}
        onClick={() => {
          const m = maneuvers.find((d) => d.name === active);
          if (m) void onSpend(m);
        }}
      >
        Spend {dieLabel}
      </SpendButton>
    </>
  );
}
