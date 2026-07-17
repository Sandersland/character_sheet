import type { IconType } from "react-icons";

import {
  GiVisoredHelm,
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
  /** Tab to mark with a live pip (the Combat tab while a session is live, #961). */
  livePipTab?: SheetTabId | null;
}

// One flavor glyph per tab; the label stays the accessible name.
const TAB_ICONS: Record<SheetTabId, IconType> = {
  overview: GiVisoredHelm,
  combat: GiCrossedSwords,
  inventory: GiKnapsack,
  magic: GiSpellBook,
  story: GiQuillInk,
};

/**
 * Mobile-only (`md:hidden`) bottom nav that swaps the top tab bar on phones.
 * Renders the character's tabs (Magic hidden for non-casters) as equal-width
 * icon+label targets. It's an in-flow child of CharacterSheetContent's 100dvh
 * app-shell (not `position: fixed`), so iOS Safari's dynamic toolbar can't shift
 * it; the safe-area padding only lifts labels clear of the home indicator.
 */
export default function SheetBottomNav({ tabs, activeTab, onTabChange, livePipTab }: SheetBottomNavProps) {
  return (
    <nav
      aria-label="Sheet sections"
      className="flex flex-none items-stretch border-t border-garnet-800 bg-gradient-to-b from-garnet-700 to-garnet-900 pb-[env(safe-area-inset-bottom)] text-parchment-50 md:hidden"
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
              active ? "bg-garnet-900 text-parchment-50" : "text-garnet-100 hover:text-parchment-50",
            ].join(" ")}
          >
            <span className="relative">
              <Icon aria-hidden className="h-5 w-5" />
              {pip && (
                <span
                  aria-hidden
                  className="absolute -right-1.5 -top-0.5 h-2 w-2 rounded-full bg-vitality-400 ring-2 ring-garnet-900"
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
