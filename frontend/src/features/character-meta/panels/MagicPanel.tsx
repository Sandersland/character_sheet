import SpellsSection from "@/features/spells/SpellsSection";
import { useCurrentCharacter } from "@/hooks/CurrentCharacterProvider";
import type { SheetPanelProps } from "@/features/character-meta/sheetTabs";

// Guards on spellcasting so a stray ?tab=magic on a non-caster renders nothing — same pattern as ClassPanel's class guard.
export default function MagicPanel({ isLive, onGoToCombat }: SheetPanelProps) {
  const { character } = useCurrentCharacter();
  if (!character.spellcasting) return null;
  return <SpellsSection isLive={isLive} onGoToCombat={onGoToCombat} />;
}
