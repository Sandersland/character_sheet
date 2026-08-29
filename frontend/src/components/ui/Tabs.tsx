import { useRef, type ReactNode, type KeyboardEvent } from "react";

interface TabItem {
  id: string;
  label: string;
  badge?: ReactNode;
}

interface TabsProps {
  tabs: TabItem[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
  // When set, gives each tab button a stable `${idBase}-tab-${tabId}` id and
  // `${idBase}-panel-${tabId}` aria-controls, so a separately-rendered panel
  // can point back with aria-labelledby.
  idBase?: string;
}

export default function Tabs({ tabs, active, onChange, className = "", idBase }: TabsProps) {
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
            id={idBase ? `${idBase}-tab-${tab.id}` : undefined}
            aria-controls={idBase ? `${idBase}-panel-${tab.id}` : undefined}
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            ref={(el) => { tabRefs.current[i] = el; }}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => handleKeyDown(e, i)}
            className={[
              "flex flex-1 items-center justify-center gap-1.5 rounded-control px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-garnet-600",
              isActive
                ? "bg-garnet-surface text-garnet-on-surface shadow-card"
                : "text-parchment-600 hover:bg-parchment-200 hover:text-parchment-800",
            ].join(" ")}
          >
            <span>{tab.label}</span>
            {tab.badge !== undefined && (
              <span className={isActive ? "text-garnet-on-surface-dim" : "text-parchment-600"}>
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
