import { lazy, Suspense, type ComponentType, type ReactNode } from "react";

import OverviewPanel from "@/features/character-meta/panels/OverviewPanel";
import ClassPanel from "@/features/character-meta/panels/ClassPanel";
import DelayedSpinner from "@/components/ui/DelayedSpinner";
import type { SheetPanelProps, SheetTabId } from "@/features/character-meta/sheetTabs";
import type { ReferenceData } from "@/types/character";

const InventoryPanel = lazy(() => import("@/features/character-meta/panels/InventoryPanel"));
const MagicPanel = lazy(() => import("@/features/character-meta/panels/MagicPanel"));
const StoryPanel = lazy(() => import("@/features/character-meta/panels/StoryPanel"));
const CombatPanel = lazy(() => import("@/features/character-meta/panels/CombatPanel"));

const STATIC_PANELS: Partial<Record<SheetTabId, ComponentType<SheetPanelProps>>> = {
  overview: OverviewPanel,
  class: ClassPanel,
  inventory: InventoryPanel,
  magic: MagicPanel,
  story: StoryPanel,
};

interface CharacterSheetBodyProps {
  reference: ReferenceData | null;
  activeTab: SheetTabId;
  livePanel?: ReactNode;
  /** Suppresses the static Combat panel while the live-session status is still
   *  resolving, so it doesn't flash before the live panel. */
  sessionLoading?: boolean;
  /** Passed through every panel via SheetPanelProps; only Magic's Cast door reads them (#1162). */
  isLive?: boolean;
  onGoToCombat?: () => void;
}

export default function CharacterSheetBody({
  reference,
  activeTab,
  livePanel,
  sessionLoading = false,
  isLive = false,
  onGoToCombat = () => {},
}: CharacterSheetBodyProps) {
  const panelProps = { reference, isLive, onGoToCombat };
  const StaticPanel = STATIC_PANELS[activeTab];
  return (
    // <main> keeps the page's main landmark; the inner tabpanel carries the
    // WAI-ARIA tab↔panel wiring (id + aria-labelledby back to the Tabs button,
    // which uses the same `sheet-tab-*` / `sheet-panel-*` id scheme).
    <main className="mx-auto max-w-6xl px-0 pt-4 pb-0 md:px-6 md:py-8">
      <div
        id={`sheet-panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`sheet-tab-${activeTab}`}
      >
        {StaticPanel && (
          <Suspense fallback={<DelayedSpinner />}>
            <StaticPanel {...panelProps} />
          </Suspense>
        )}
        
        {activeTab === "combat" && !livePanel && !sessionLoading && (
          <Suspense fallback={<DelayedSpinner />}>
            <CombatPanel />
          </Suspense>
        )}
        {/* Mounted-but-hidden off Combat, not unmounted, so an in-progress picker survives a tab swipe. */}
        {livePanel && <div hidden={activeTab !== "combat"}>{livePanel}</div>}
      </div>
    </main>
  );
}
