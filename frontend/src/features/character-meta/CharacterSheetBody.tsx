import AbilityScoresPanel from "@/features/abilities/AbilityScoresPanel";
import AdvancementSection from "@/features/advancement/AdvancementSection";
import ClassFeaturesSection from "@/features/class/ClassFeaturesSection";
import ExperienceTracker from "@/features/experience/ExperienceTracker";
import HitPointTracker from "@/features/hitpoints/HitPointTracker";
import InventoryList from "@/features/inventory/InventoryList";
import CampaignPreferencesPanel from "@/features/campaign/CampaignPreferencesPanel";
import JournalDoorway from "@/features/journal/JournalDoorway";
import SpellsSection from "@/features/spells/SpellsSection";
import ProficienciesCard from "@/features/abilities/ProficienciesCard";
import VitalsStrip from "@/features/character-meta/VitalsStrip";
import ItemGrantsCard from "@/features/character-meta/ItemGrantsCard";
import ConditionsStrip from "@/features/conditions/ConditionsStrip";
import Card from "@/components/ui/Card";
import { hasAdvancements, hasProficiencies } from "@/lib/characterSections";
import type { Character, ReferenceData } from "@/types/character";

interface CharacterSheetBodyProps {
  character: Character;
  reference: ReferenceData | null;
  onUpdate: (c: Character) => void;
}

export default function CharacterSheetBody({
  character,
  reference,
  onUpdate,
}: CharacterSheetBodyProps) {
  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8">

      {/* ── Combat vitals at a glance ───────────────────────────────── */}
      <VitalsStrip character={character} />

      {/* ── Active conditions + exhaustion ──────────────────────────── */}
      <ConditionsStrip character={character} onUpdate={onUpdate} />

      {/* ── Hit points · Experience ────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <HitPointTracker
          character={character}
          referenceClasses={reference?.classes ?? []}
          onUpdate={onUpdate}
        />
        <ExperienceTracker character={character} onUpdate={onUpdate} />
      </div>

      {/* ── Ability scores · Saves · Skills ────────────────────────── */}
      <AbilityScoresPanel character={character} />

      {/* ── Proficiencies & Languages ───────────────────────────────── */}
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

      {/* ── Item-granted resistances, immunities & advantages (#529) ── */}
      <ItemGrantsCard character={character} />

      {/* ── Features & Traits ──────────────────────────────────────── */}
      {/* Class features + Advancements grouped together as on a printed sheet. */}
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

      {/* ── Equipment · Spells ─────────────────────────────────────── */}
      {character.spellcasting ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <InventoryList character={character} onUpdate={onUpdate} />
          <Card title="Spells" className="p-4">
            <SpellsSection character={character} onUpdate={onUpdate} />
          </Card>
        </div>
      ) : (
        <InventoryList character={character} onUpdate={onUpdate} />
      )}

      {/* ── Journal doorway (#867) ─────────────────────────────────── */}
      {/* The journal lives on its own page now; the sheet keeps just this
          closed-book card that opens it — no editing surface here. */}
      <JournalDoorway character={character} />

      {/* ── Campaign preferences ────────────────────────────────────── */}
      {/* Campaign-attached characters only (#537). */}
      {character.campaignId && (
        <CampaignPreferencesPanel character={character} onUpdate={onUpdate} />
      )}
    </main>
  );
}
