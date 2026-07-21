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
    // #1208: CharacterSheetBody has zero mobile gutter (px-0, md:px-6 only), so
    // this panel supplies its own 16px inset to match the p-4 cards sibling tabs use.
    <div className="px-4 md:px-0">
      <ClassFeaturesSection
        character={character}
        referenceClasses={reference?.classes ?? []}
        onUpdate={onUpdate}
      />
    </div>
  );
}
