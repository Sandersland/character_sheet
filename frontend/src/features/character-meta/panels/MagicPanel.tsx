import SpellsSection from "@/features/spells/SpellsSection";
import type { SheetPanelProps } from "@/features/character-meta/sheetTabs";

// Magic tab — caster-only (hidden for non-casters via getSheetTabs). Hosts the
// self-styled spellcasting block (#893) + grimoire (#894); #926 dropped the
// redundant outer "Spells" Card so they aren't double-framed. Guards on
// spellcasting so a stray ?tab=magic on a non-caster renders nothing. Forwards
// isLive/onGoToCombat so the record view's Cast door can defer to Combat during
// a live session (#1162).
export default function MagicPanel({ character, onUpdate, isLive, onGoToCombat }: SheetPanelProps) {
  if (!character.spellcasting) return null;
  return (
    <SpellsSection character={character} onUpdate={onUpdate} isLive={isLive} onGoToCombat={onGoToCombat} />
  );
}
