import { useRef, type ReactNode, type KeyboardEvent } from "react";

interface TabItem {
  id: string;
  label: string;
  /** Optional badge/pill rendered to the right of the label (e.g. a count). */
  badge?: ReactNode;
}

interface TabsProps {
  tabs: TabItem[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
}

/**
 * Segmented-control tab switcher — domain-agnostic, controlled.
 *
 * Renders only the switcher; the caller renders the active panel below it.
 * Follows WAI-ARIA Tabs pattern: role="tablist", role="tab" on buttons,
 * aria-selected, roving tabindex, ArrowLeft/Right/Home/End keyboard nav.
 *
 * Design: filled garnet pill for the active tab inside a parchment-100 track;
 * consistent with rounded-control radius and existing garnet/parchment tokens.
 */
export default function Tabs({ tabs, active, onChange, className = "" }: TabsProps) {
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function handleKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const count = tabs.length;
    let next = index;

    if (e.key === "ArrowRight") {
      next = (index + 1) % count;
    } else if (e.key === "ArrowLeft") {
      next = (index - 1 + count) % count;
    } else if (e.key === "Home") {
      next = 0;
    } else if (e.key === "End") {
      next = count - 1;
    } else {
      return;
    }

    e.preventDefault();
    tabRefs.current[next]?.focus();
    onChange(tabs[next].id);
  }

  return (
    <div
      role="tablist"
      aria-label="Section tabs"
      className={`flex gap-1 rounded-control border border-parchment-200 bg-parchment-100 p-1 ${className}`}
    >
      {tabs.map((tab, i) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            ref={(el) => { tabRefs.current[i] = el; }}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => handleKeyDown(e, i)}
            className={[
              "flex flex-1 items-center justify-center gap-1.5 rounded-control px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-garnet-600",
              isActive
                ? "bg-garnet-700 text-parchment-50 shadow-card"
                : "text-parchment-600 hover:bg-parchment-200 hover:text-parchment-800",
            ].join(" ")}
          >
            <span>{tab.label}</span>
            {tab.badge !== undefined && (
              <span className={isActive ? "text-parchment-200" : "text-parchment-400"}>
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
