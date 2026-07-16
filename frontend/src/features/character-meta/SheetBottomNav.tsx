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
export default function SheetBottomNav({ tabs, activeTab, onTabChange }: SheetBottomNavProps) {
  return (
    <nav
      aria-label="Sheet sections"
      className="flex flex-none items-stretch border-t border-garnet-800 bg-gradient-to-b from-garnet-700 to-garnet-900 pb-[env(safe-area-inset-bottom)] text-parchment-50 md:hidden"
    >
      {tabs.map((tab) => {
        const Icon = TAB_ICONS[tab.id];
        const active = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            type="button"
            aria-current={active ? "page" : undefined}
            onClick={() => onTabChange(tab.id)}
            className={[
              "flex flex-1 flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-parchment-50",
              active ? "bg-garnet-900 text-parchment-50" : "text-garnet-100 hover:text-parchment-50",
            ].join(" ")}
          >
            <Icon aria-hidden className="h-5 w-5" />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
