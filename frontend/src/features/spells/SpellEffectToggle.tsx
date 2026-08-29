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
