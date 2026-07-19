import AbilityScoresPanel from "@/features/abilities/AbilityScoresPanel";
import AllSkillsCard from "@/features/abilities/AllSkillsCard";
import ConditionRollBanner from "@/features/conditions/ConditionRollBanner";
import MobileQuickBar from "@/features/character-meta/MobileQuickBar";
import ProficienciesCard from "@/features/abilities/ProficienciesCard";
import ClassFeaturesSection from "@/features/class/ClassFeaturesSection";
import AdvancementSection from "@/features/advancement/AdvancementSection";
import ExperienceTracker from "@/features/experience/ExperienceTracker";
import SpellSlotSummary from "@/features/spells/SpellSlotSummary";
import EquippedItemsCard from "@/features/inventory/EquippedItemsCard";
import Card from "@/components/ui/Card";
import { hasAdvancements, hasProficiencies } from "@/lib/characterSections";
import type { SheetPanelProps } from "@/features/character-meta/sheetTabs";

/**
 * Overview tab — abilities + saves on top, then a calm 3-column grid: all-18
 * skills (inline roll rows), features, and the XP/slots/equipped rail (#923).
 * Saving throws stay
 * inside AbilityScoresPanel; full slot/spell management lives on the Magic tab.
 */
export default function OverviewPanel({ character, reference, onUpdate }: SheetPanelProps) {
  return (
    <div className="flex flex-col gap-6">
      {/* Prof/Speed/Init left the compact header (#1026); on phones they sit
          here as a slim quick-bar (#1084). Desktop keeps them in the banner. */}
      <MobileQuickBar character={character} />
      {/* One home for active roll-modifying states (#984) — above the rails, so
          the fact is said once, not stamped under every box + skill row. */}
      <ConditionRollBanner modifiers={character.rollModifiers} />
      <AbilityScoresPanel character={character} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:items-start">
        <div className="flex flex-col gap-6">
          <AllSkillsCard
            skills={character.skills}
            abilityScores={character.abilityScores}
            proficiencyBonus={character.proficiencyBonus}
          />

          {hasProficiencies(character) && (
            <Card title="Proficiencies" className="p-4">
              <ProficienciesCard
                character={character}
                artisanTools={reference?.artisanTools ?? []}
                onUpdate={onUpdate}
              />
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-6">
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

        <div className="flex flex-col gap-6">
          <ExperienceTracker character={character} onUpdate={onUpdate} />

          {character.spellcasting && (
            <Card title="Spell Slots" className="p-4">
              <SpellSlotSummary slots={character.spellcasting.slots} />
            </Card>
          )}

          <EquippedItemsCard inventory={character.inventory} />
        </div>
      </div>
    </div>
  );
}
