import JournalDoorway from "@/features/journal/JournalDoorway";
import IdentityCard from "@/features/character-meta/IdentityCard";
import PortraitCard from "@/features/character-meta/PortraitCard";

/**
 * Story tab — the low-frequency narrative surfaces: the journal doorway (opens
 * the field-chronicle page), the portrait editor (#1616), and a read-only
 * identity summary (background/alignment, #927). Campaign preferences moved to
 * the header ⋮ "Campaign settings" sheet (#1087) — they're settings, not
 * story. Takes no props (still assignable to the SheetPanelProps-typed panel
 * registry).
 */
export default function StoryPanel() {
  return (
    <div className="flex flex-col gap-6">
      <JournalDoorway />
      <PortraitCard />
      <IdentityCard />
    </div>
  );
}
