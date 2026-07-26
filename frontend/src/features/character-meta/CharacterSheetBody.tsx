import { lazy, Suspense, type ComponentType, type ReactNode } from "react";

import OverviewPanel from "@/features/character-meta/panels/OverviewPanel";
import ClassPanel from "@/features/character-meta/panels/ClassPanel";
import DelayedSpinner from "@/components/ui/DelayedSpinner";
import type { SheetPanelProps, SheetTabId } from "@/features/character-meta/sheetTabs";
import type { ReferenceData } from "@/types/character";

// #1279: these three panels are the sheet's heaviest per-tab trees (spells,
// inventory, journal) — route-lazied so their weight loads on first activation
// of that tab rather than riding along with the sheet's own chunk. Overview and
// Class stay eager: Overview is the tab shown on first sheet load, and Class
// isn't one of the heavy trees, so lazying them would only add a request with
// no bundle-size win.
const InventoryPanel = lazy(() => import("@/features/character-meta/panels/InventoryPanel"));
const MagicPanel = lazy(() => import("@/features/character-meta/panels/MagicPanel"));
const StoryPanel = lazy(() => import("@/features/character-meta/panels/StoryPanel"));
// Idle Combat pulls the session domain (CombatColumn/HitPointTracker/SessionLog);
// lazied separately from the live tracker (CharacterSheetContent's CombatLivePanel)
// so an idle sheet never fetches the live-turn chunk.
const CombatPanel = lazy(() => import("@/features/character-meta/panels/CombatPanel"));

// Combat is excluded: it has extra live-session conditions handled inline below,
// not a plain tab→panel mapping. Keyed lookup (vs. a chain of `&&` branches)
// keeps CharacterSheetBody's complexity down as tabs are added (#1169).
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
  /**
   * The live-Combat turn tracker (#960), when a session is live + joined. It
   * SUPERSEDES the static Combat panel and stays mounted across tab switches
   * (hidden off-Combat) so an in-progress picker + economy survive a swipe.
   */
  livePanel?: ReactNode;
  /** True while the live-session status is still resolving — suppress the static
   *  Combat panel for that beat so it doesn't flash before the live panel. */
  sessionLoading?: boolean;
  /** Live-session status + the header's "jump to Combat" handler — passed through
   *  to every panel via SheetPanelProps; only Magic's Cast door reads them (#1162). */
  isLive?: boolean;
  onGoToCombat?: () => void;
}

/**
 * Renders the active tab's panel. The banner (CharacterSheetHeader) owns the tab
 * bar and always-on vitals; this is only the workspace region below it.
 */
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
        {/* Combat: the live tracker supersedes the static panel; while the
            live-session status is still loading, render neither (no flash). */}
        {activeTab === "combat" && !livePanel && !sessionLoading && (
          <Suspense fallback={<DelayedSpinner />}>
            <CombatPanel />
          </Suspense>
        )}
        {/* Mounted-but-hidden off Combat so an in-progress picker + economy
            survive a swipe round-trip (the turn state itself lives in the
            provider; this preserves the open-picker UI state). */}
        {livePanel && <div hidden={activeTab !== "combat"}>{livePanel}</div>}
      </div>
    </main>
  );
}
