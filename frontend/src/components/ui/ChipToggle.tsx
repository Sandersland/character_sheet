import type { ReactNode } from "react";

interface ChipToggleProps {
  pressed: boolean;
  onChange: (pressed: boolean) => void;
  children: ReactNode;
  className?: string;
}

// Pill-shaped boolean toggle (aria-pressed). Pair inside a ChipGroup.
export default function ChipToggle({ pressed, onChange, children, className = "" }: ChipToggleProps) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={() => onChange(!pressed)}
      className={[
        "rounded-full border px-3 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-garnet-600",
        pressed
          ? "border-garnet-600 bg-garnet-700 text-parchment-50"
          : "border-parchment-300 bg-parchment-50 text-parchment-700 hover:bg-parchment-200",
        className,
      ].join(" ")}
    >
      {children}
    </button>
  );
}
