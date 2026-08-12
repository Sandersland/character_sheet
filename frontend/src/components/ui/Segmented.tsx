import { useCallback } from "react";

import { useRovingRadioGroup } from "@/hooks/useRovingRadioGroup";

interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedProps<T extends string> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
}

// Single-select segmented control (WAI-ARIA radiogroup), styled like Tabs.tsx.
// Roving tabindex + arrow/Home/End keyboard behavior comes from the shared
// useRovingRadioGroup hook (#1111/#1324).
export default function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className = "",
}: SegmentedProps<T>) {
  const checkedIndex = options.findIndex((opt) => opt.value === value);
  const selectOption = useCallback((index: number) => onChange(options[index].value), [onChange, options]);
  const { itemRef, tabIndexFor, keyDownFor } = useRovingRadioGroup(options.length, checkedIndex, selectOption);

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`flex flex-wrap gap-1 rounded-control border border-parchment-200 bg-parchment-100 p-1 ${className}`}
    >
      {options.map((opt, i) => {
        const isActive = opt.value === value;
        return (
          <button
            key={opt.value}
            role="radio"
            type="button"
            aria-checked={isActive}
            tabIndex={tabIndexFor(i)}
            ref={itemRef(i)}
            onClick={() => onChange(opt.value)}
            onKeyDown={keyDownFor(i)}
            className={[
              "flex flex-1 items-center justify-center rounded-control px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-garnet-600",
              isActive
                ? "bg-garnet-surface text-garnet-on-surface shadow-card"
                : "text-parchment-600 hover:bg-parchment-200 hover:text-parchment-800",
            ].join(" ")}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
