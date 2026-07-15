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
        {activeTab === "combat" && <CombatPanel {...panelProps} />}
        {activeTab === "inventory" && <InventoryPanel {...panelProps} />}
        {activeTab === "magic" && <MagicPanel {...panelProps} />}
        {activeTab === "story" && <StoryPanel {...panelProps} />}
      </div>
    </main>
  );
}
