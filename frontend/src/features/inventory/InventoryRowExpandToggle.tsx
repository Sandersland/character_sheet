import { ChevronDown } from "lucide-react";

interface InventoryRowExpandToggleProps {
  expanded: boolean;
  onToggle: () => void;
}

// Kept as its own component, not inlined into InventoryRow, so InventoryRow's
// own cyclomatic/cognitive score stays under the fallow complexity gate.
export default function InventoryRowExpandToggle({ expanded, onToggle }: InventoryRowExpandToggleProps) {
  return (
    <button
      type="button"
      aria-expanded={expanded}
      aria-label={expanded ? "Hide details" : "Show details"}
      onClick={onToggle}
      className="flex h-7 w-7 items-center justify-center rounded-control text-parchment-500 transition-colors hover:bg-parchment-200 hover:text-parchment-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-garnet-600"
    >
      <ChevronDown aria-hidden="true" className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
    </button>
  );
}
