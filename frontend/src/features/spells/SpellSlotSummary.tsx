import type { SpellSlots } from "@/types/character";

interface SpellSlotSummaryProps {
  slots: SpellSlots[];
}

export default function SpellSlotSummary({ slots }: SpellSlotSummaryProps) {
  const rows = slots ?? [];
  if (rows.length === 0) return null;

  return (
    <ul className="flex flex-col gap-2">
      {rows.map((slot) => {
        const remaining = slot.total - slot.used;
        return (
          <li key={slot.level} className="flex items-center gap-2 text-sm">
            <span className="w-14 shrink-0 text-xs font-medium text-parchment-600">
              Level {slot.level}
            </span>
            <span className="flex flex-wrap gap-1" aria-hidden="true">
              {Array.from({ length: slot.total }, (_, i) => (
                <span
                  key={i}
                  className={`block h-2.5 w-2.5 rounded-full ${
                    i < remaining ? "bg-arcane-500" : "border border-parchment-300 bg-transparent"
                  }`}
                />
              ))}
            </span>
            <span className="ml-auto tabular-nums text-xs text-parchment-600">
              {remaining}/{slot.total}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
