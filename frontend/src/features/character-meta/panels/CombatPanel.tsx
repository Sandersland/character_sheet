import HitPointTracker from "@/features/hitpoints/HitPointTracker";
import ConditionsStrip from "@/features/conditions/ConditionsStrip";
import ItemGrantsCard from "@/features/character-meta/ItemGrantsCard";
import type { SheetPanelProps } from "@/features/character-meta/sheetTabs";

/**
 * Combat tab — the moment-to-moment combat surfaces: conditions, hit points, and
 * item-granted defenses. Slice #922 relocates them unchanged; the grouped combat
 * layout (adding saves/defenses) lands in #924.
 */
export default function CombatPanel({ character, reference, onUpdate }: SheetPanelProps) {
  return (
    <div className="flex flex-col gap-6">
      <ConditionsStrip character={character} onUpdate={onUpdate} />
      <HitPointTracker
        character={character}
        referenceClasses={reference?.classes ?? []}
        onUpdate={onUpdate}
      />
      <ItemGrantsCard character={character} />
    </div>
  );
}
