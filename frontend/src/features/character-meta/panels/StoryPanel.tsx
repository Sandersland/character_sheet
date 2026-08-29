import JournalDoorway from "@/features/journal/JournalDoorway";
import IdentityCard from "@/features/character-meta/IdentityCard";
import SpeciesTraitsCard from "@/features/species/SpeciesTraitsCard";

// Takes no props (still assignable to the SheetPanelProps-typed panel registry).
export default function StoryPanel() {
  return (
    <div className="flex flex-col gap-6">
      <JournalDoorway />
      <IdentityCard />
      <SpeciesTraitsCard />
    </div>
  );
}
