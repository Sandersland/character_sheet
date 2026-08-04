import JournalDoorway from "@/features/journal/JournalDoorway";
import IdentityCard from "@/features/character-meta/IdentityCard";
import SpeciesTraitsCard from "@/features/species/SpeciesTraitsCard";

/**
 * Story tab — the low-frequency narrative surfaces: the journal doorway (opens
 * the field-chronicle page), the identity card, which carries both the
 * read-only background/alignment summary (#927) and the portrait editor
 * (#1616, merged in by #1618), and the species-granted trait card (#1682 —
 * the sheet's first species-info surface). Campaign preferences moved to the
 * header ⋮ "Campaign settings" sheet (#1087) — they're settings, not story.
 * Takes no props (still assignable to the SheetPanelProps-typed panel registry).
 */
export default function StoryPanel() {
  return (
    <div className="flex flex-col gap-6">
      <JournalDoorway />
      <IdentityCard />
      <SpeciesTraitsCard />
    </div>
  );
}
