import JournalDoorway from "@/features/journal/JournalDoorway";
import IdentityCard from "@/features/character-meta/IdentityCard";
import type { SheetPanelProps } from "@/features/character-meta/sheetTabs";

/**
 * Story tab — the low-frequency narrative surfaces: the journal doorway (opens
 * the field-chronicle page) and a read-only identity summary (background/
 * alignment, #927). Campaign preferences moved to the header ⋮ "Campaign
 * settings" sheet (#1087) — they're settings, not story.
 */
export default function StoryPanel({ character }: SheetPanelProps) {
  return (
    <div className="flex flex-col gap-6">
      <JournalDoorway character={character} />
      <IdentityCard character={character} />
    </div>
  );
}
