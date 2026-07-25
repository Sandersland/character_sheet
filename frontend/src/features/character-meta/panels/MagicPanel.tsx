import SpellsSection from "@/features/spells/SpellsSection";
import { useCurrentCharacter } from "@/hooks/CurrentCharacterProvider";
import type { SheetPanelProps } from "@/features/character-meta/sheetTabs";

// Magic tab — caster-only (hidden for non-casters via getSheetTabs). Hosts the
// self-styled spellcasting block (#893) + grimoire (#894); #926 dropped the
// redundant outer "Spells" Card so they aren't double-framed. Guards on
// spellcasting so a stray ?tab=magic on a non-caster renders nothing. Forwards
// isLive/onGoToCombat so the record view's Cast door can defer to Combat during
// a live session (#1162).
export default function MagicPanel({ isLive, onGoToCombat }: Omit<SheetPanelProps, "character" | "reference">) {
  const { character } = useCurrentCharacter();
  if (!character.spellcasting) return null;
  return <SpellsSection isLive={isLive} onGoToCombat={onGoToCombat} />;
}
