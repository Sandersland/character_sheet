import type { IconType } from "react-icons";

import {
  GiVisoredHelm,
  GiRank3,
  GiCrossedSwords,
  GiKnapsack,
  GiSpellBook,
  GiQuillInk,
} from "@/components/ui/icons";
import type { SheetTab, SheetTabId } from "@/features/character-meta/sheetTabs";

interface SheetBottomNavProps {
  tabs: SheetTab[];
  activeTab: SheetTabId;
  onTabChange: (id: SheetTabId) => void;
  livePipTab?: SheetTabId | null;
}

const TAB_ICONS: Record<SheetTabId, IconType> = {
  overview: GiVisoredHelm,
  class: GiRank3,
  combat: GiCrossedSwords,
  inventory: GiKnapsack,
  magic: GiSpellBook,
  story: GiQuillInk,
};

// In-flow, not position: fixed, so iOS Safari's dynamic toolbar can't shift it; the safe-area padding only lifts labels clear of the home indicator.
export default function SheetBottomNav({ tabs, activeTab, onTabChange, livePipTab }: SheetBottomNavProps) {
  return (
    <nav
      aria-label="Sheet sections"
      className="flex flex-none items-stretch border-t border-garnet-surface-hover bg-gradient-to-b from-garnet-surface to-garnet-surface-deep pb-[env(safe-area-inset-bottom)] text-garnet-on-surface md:hidden"
    >
      {tabs.map((tab) => {
        const Icon = TAB_ICONS[tab.id];
        const active = tab.id === activeTab;
        const pip = livePipTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            aria-current={active ? "page" : undefined}
            onClick={() => onTabChange(tab.id)}
            className={[
              "relative flex flex-1 flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-parchment-50",
              active
                ? "bg-garnet-surface-deep text-garnet-on-surface"
                : "text-garnet-on-surface-dim hover:text-garnet-on-surface",
            ].join(" ")}
          >
            <span className="relative">
              <Icon aria-hidden className="h-5 w-5" />
              {pip && (
                <span
                  aria-hidden
                  className="absolute -right-1.5 -top-0.5 h-2 w-2 rounded-full bg-vitality-400 ring-2 ring-garnet-surface-deep"
                />
              )}
            </span>
            <span>
              {tab.label}
              {pip && <span className="sr-only"> (session live)</span>}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
