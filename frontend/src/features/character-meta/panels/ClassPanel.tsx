import ClassFeaturesSection from "@/features/class/ClassFeaturesSection";
import type { SheetPanelProps } from "@/features/character-meta/sheetTabs";

/**
 * Class tab (#1169) — the class-features workspace pulled off Overview, where a
 * level-7+ multiclass card was dwarfing the rest of the page. Renders the same
 * orchestrator (roster/subclass/resources/maneuvers/feature text) full-width;
 * AdvancementSection stays on Overview (cross-class, not per-class). Guards on
 * `character.class` so a stray `?tab=class` mid-creation renders nothing, same
 * pattern as MagicPanel's spellcasting guard.
 */
export default function ClassPanel({ character, reference, onUpdate }: SheetPanelProps) {
  if (!character.class) return null;
  return (
    <ClassFeaturesSection
      character={character}
      referenceClasses={reference?.classes ?? []}
      onUpdate={onUpdate}
    />
  );
}
