// Shared "enable auto-rolling on cast" bordered checkbox wrapper — used by
// CustomSpellForm (per-character inline spell) and HomebrewSpellForm
// (catalog homebrew spell, #1787). Identical markup in both was flagged as
// duplication; this is the single source now. `children` is the caller's own
// effect-fields subtree, rendered only while `hasEffect` is on.
import type { ReactNode } from "react";

interface SpellEffectToggleProps {
  hasEffect: boolean;
  onToggle: (hasEffect: boolean) => void;
  children?: ReactNode;
}

export default function SpellEffectToggle({ hasEffect, onToggle, children }: SpellEffectToggleProps) {
  return (
    <div className="rounded-control border border-arcane-200 p-3">
      <label className="mb-2 flex items-center gap-2 text-xs font-semibold text-arcane-800">
        <input type="checkbox" checked={hasEffect} onChange={(e) => onToggle(e.target.checked)} />
        Enable auto-rolling on cast
      </label>
      {hasEffect && children}
    </div>
  );
}
