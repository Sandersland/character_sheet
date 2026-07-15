import AbilityScoresPanel from "@/features/abilities/AbilityScoresPanel";
import ProficienciesCard from "@/features/abilities/ProficienciesCard";
import ClassFeaturesSection from "@/features/class/ClassFeaturesSection";
import AdvancementSection from "@/features/advancement/AdvancementSection";
import ExperienceTracker from "@/features/experience/ExperienceTracker";
import Card from "@/components/ui/Card";
import { hasAdvancements, hasProficiencies } from "@/lib/characterSections";
import type { SheetPanelProps } from "@/features/character-meta/sheetTabs";

/**
 * Overview tab — abilities, XP, proficiencies, and the character's features.
 *
 * Slice #922 relocates the existing sections here unchanged; the curated 3-column
 * layout (proficient-skills summary + "All 18", features, XP/slots/equipped) lands
 * in #923.
 */
export default function OverviewPanel({ character, reference, onUpdate }: SheetPanelProps) {
  return (
    <div className="flex flex-col gap-6">
      <AbilityScoresPanel character={character} />

      <ExperienceTracker character={character} onUpdate={onUpdate} />

      {/* Hidden when there's nothing to display and no pending tool choice. */}
      {hasProficiencies(character) && (
        <Card title="Proficiencies" className="p-4">
          <ProficienciesCard
            character={character}
            artisanTools={reference?.artisanTools ?? []}
            onUpdate={onUpdate}
          />
        </Card>
      )}

      {character.class && (
        <Card title="Class Features" className="p-4">
          <ClassFeaturesSection
            character={character}
            referenceClasses={reference?.classes ?? []}
            onUpdate={onUpdate}
          />
        </Card>
      )}

      {hasAdvancements(character) && (
        <div id="advancement-card">
          <Card title="Advancements" className="p-4">
            <AdvancementSection character={character} onUpdate={onUpdate} />
          </Card>
        </div>
      )}
    </div>
  );
}
