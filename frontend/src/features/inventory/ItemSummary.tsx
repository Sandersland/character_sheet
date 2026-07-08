import { capabilitySummary } from "@/lib/capabilities";
import type { InventoryItem } from "@/types/character";

interface ItemSummaryProps {
  item: InventoryItem;
  details: string[];
  selectMode: boolean;
  selected: boolean;
  onToggleSelect?: () => void;
}

// An item's leading block: optional sell checkbox, name (must stay the first <p>), and the dotted detail line.
export default function ItemSummary({
  item,
  details,
  selectMode,
  selected,
  onToggleSelect,
}: ItemSummaryProps) {
  return (
    <div className="flex min-w-0 items-start gap-2">
      {selectMode && (
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          aria-label={`Select ${item.name}`}
          className="mt-1"
        />
      )}
      <div className="min-w-0">
        <p className="text-sm font-medium text-parchment-900">{item.name}</p>
        <p className="mt-0.5 text-xs text-parchment-600">{details.join(" · ")}</p>
        {(item.requiresAttunement || item.charges || (item.capabilities?.length ?? 0) > 0) && (
          <div className="mt-1 flex flex-wrap gap-1">
            {item.requiresAttunement && (
              <span
                className={`rounded-full px-1.5 py-0.5 text-[0.625rem] font-semibold ${
                  item.attuned
                    ? "bg-arcane-100 text-arcane-800"
                    : "border border-parchment-300 text-parchment-600"
                }`}
              >
                {item.attuned ? "Attuned" : "Requires attunement"}
              </span>
            )}
            {item.charges && (
              <span
                title={item.charges.recharge}
                className={`rounded-full px-1.5 py-0.5 text-[0.625rem] font-semibold ${
                  item.charges.remaining === 0
                    ? "border border-parchment-300 text-parchment-500"
                    : "bg-arcane-100 text-arcane-800"
                }`}
              >
                {item.charges.remaining}/{item.charges.max} charges
              </span>
            )}
            {(item.capabilities ?? [])
              .filter((c) => c.kind === "passiveBonus")
              .map((cap, i) => (
                <span
                  key={i}
                  className="rounded-full bg-gold-100 px-1.5 py-0.5 text-[0.625rem] font-semibold text-gold-800"
                >
                  {capabilitySummary(cap)}
                </span>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
