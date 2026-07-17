import type { ReactNode } from "react";

import OverviewPanel from "@/features/character-meta/panels/OverviewPanel";
import CombatPanel from "@/features/character-meta/panels/CombatPanel";
import InventoryPanel from "@/features/character-meta/panels/InventoryPanel";
import MagicPanel from "@/features/character-meta/panels/MagicPanel";
import StoryPanel from "@/features/character-meta/panels/StoryPanel";
import type { SheetTabId } from "@/features/character-meta/sheetTabs";
import type { Character, ReferenceData } from "@/types/character";

interface CharacterSheetBodyProps {
  character: Character;
  reference: ReferenceData | null;
  onUpdate: (c: Character) => void;
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
}

/**
 * Renders the active tab's panel. The banner (CharacterSheetHeader) owns the tab
 * bar and always-on vitals; this is only the workspace region below it.
 */
export default function CharacterSheetBody({
  character,
  reference,
  onUpdate,
  activeTab,
  livePanel,
  sessionLoading = false,
}: CharacterSheetBodyProps) {
  const panelProps = { character, reference, onUpdate };
  return (
    // <main> keeps the page's main landmark; the inner tabpanel carries the
    // WAI-ARIA tab↔panel wiring (id + aria-labelledby back to the Tabs button,
    // which uses the same `sheet-tab-*` / `sheet-panel-*` id scheme).
    <main className="mx-auto max-w-6xl px-6 py-8">
      <div
        id={`sheet-panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`sheet-tab-${activeTab}`}
      >
        {activeTab === "overview" && <OverviewPanel {...panelProps} />}
        {/* Combat: the live tracker supersedes the static panel; while the
            live-session status is still loading, render neither (no flash). */}
        {activeTab === "combat" && !livePanel && !sessionLoading && <CombatPanel {...panelProps} />}
        {activeTab === "inventory" && <InventoryPanel {...panelProps} />}
        {activeTab === "magic" && <MagicPanel {...panelProps} />}
        {activeTab === "story" && <StoryPanel {...panelProps} />}
        {/* Mounted-but-hidden off Combat so an in-progress picker + economy
            survive a swipe round-trip (the turn state itself lives in the
            provider; this preserves the open-picker UI state). */}
        {livePanel && <div hidden={activeTab !== "combat"}>{livePanel}</div>}
      </div>
    </main>
  );
}
