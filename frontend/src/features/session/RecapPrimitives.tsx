import type { ReactNode } from "react";

import Badge from "@/components/ui/Badge";
import { sortSlotsSpent } from "@/lib/sessionRecap";
import type { SessionSummaryAdvancement, SessionSummaryItem } from "@/types/character";

export function StatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-card border border-parchment-200 bg-parchment-50 px-3 py-3 text-center">
      <span className={`font-display text-2xl font-semibold ${tone}`}>{value}</span>
      <span className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-parchment-600">
        {label}
      </span>
    </div>
  );
}

// A wrapped row of "×{qty} {name}" item badges (acquired or sold).
export function ItemBadgeList({ items }: { items: SessionSummaryItem[] }) {
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-parchment-900">
      {items.map((item) => (
        <li key={item.name} className="flex items-center gap-1.5">
          <Badge tone="gold">×{item.qty}</Badge>
          <span>{item.name}</span>
        </li>
      ))}
    </ul>
  );
}

// Spell slots spent, one badge per level ("L1 ×2"), ascending by level.
export function SlotsSpentRow({ slotsSpent }: { slotsSpent: Record<string, number> }) {
  const levels = sortSlotsSpent(slotsSpent);
  if (levels.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-parchment-900">
      {levels.map(([level, count]) => (
        <li key={level} className="flex items-center gap-1.5">
          <Badge tone="arcane">
            L{level} ×{count}
          </Badge>
        </li>
      ))}
    </ul>
  );
}

// Feats + Ability Score Improvements taken, as labelled rows.
export function AdvancementsList({ advancements }: { advancements: SessionSummaryAdvancement[] }) {
  if (advancements.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1 text-sm text-parchment-900">
      {advancements.map((adv, i) => (
        <li key={`${adv.type}-${i}`} className="flex items-center gap-2">
          <Badge tone="vitality">{adv.type === "featTaken" ? "feat" : "ASI"}</Badge>
          <span>{adv.label}</span>
        </li>
      ))}
    </ul>
  );
}

// A small labelled recap group. Callers gate visibility themselves.
export function RecapGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-parchment-600">{label}</p>
      {children}
    </div>
  );
}
