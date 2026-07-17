import HitPointTracker from "@/features/hitpoints/HitPointTracker";
import ConditionsStrip from "@/features/conditions/ConditionsStrip";
import ItemGrantsCard from "@/features/character-meta/ItemGrantsCard";
import type { SheetPanelProps } from "@/features/character-meta/sheetTabs";

/**
 * Combat tab — the moment-to-moment combat surfaces grouped top to bottom: hit
 * points (meter + hit dice + death saves + rest), conditions & exhaustion, then
 * item-granted defenses. Saving throws stay on Overview inside the ability boxes.
 */
export default function CombatPanel({ character, reference, onUpdate }: SheetPanelProps) {
  return (
    <div className="flex flex-col gap-6">
      <HitPointTracker
        character={character}
        referenceClasses={reference?.classes ?? []}
        onUpdate={onUpdate}
      />
      <ConditionsStrip character={character} onUpdate={onUpdate} />
      <ItemGrantsCard character={character} />
    </div>
  );
}
