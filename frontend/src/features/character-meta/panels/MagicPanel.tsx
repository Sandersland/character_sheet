import SpellsSection from "@/features/spells/SpellsSection";
import Card from "@/components/ui/Card";
import type { SheetPanelProps } from "@/features/character-meta/sheetTabs";

/**
 * Magic tab — caster-only (the tab itself is hidden for non-casters, see
 * getSheetTabs). Slice #922 hosts the current SpellsSection unchanged; the
 * redesigned spellcasting block (#893) and grimoire (#894) build into this tab
 * next, and #926 does the final assembly. Guards on spellcasting so a direct
 * `?tab=magic` on a non-caster renders nothing rather than crashing.
 */
export default function MagicPanel({ character, onUpdate }: SheetPanelProps) {
  if (!character.spellcasting) return null;
  return (
    <div className="flex flex-col gap-6">
      <Card title="Spells" className="p-4">
        <SpellsSection character={character} onUpdate={onUpdate} />
      </Card>
    </div>
  );
}
