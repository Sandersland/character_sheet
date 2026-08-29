import ClassFeaturesSection from "@/features/class/ClassFeaturesSection";
import { useCurrentCharacter } from "@/hooks/CurrentCharacterProvider";
import type { SheetPanelProps } from "@/features/character-meta/sheetTabs";

// Guards on character.class so a stray ?tab=class mid-creation renders nothing — same pattern as MagicPanel's spellcasting guard.
export default function ClassPanel({ reference }: SheetPanelProps) {
  const { character } = useCurrentCharacter();
  if (!character.class) return null;
  return (
    // CharacterSheetBody has zero mobile gutter (px-0, md:px-6 only), so this panel supplies its own inset to match sibling tabs' p-4 cards.
    <div className="px-4 md:px-0">
      <ClassFeaturesSection referenceClasses={reference?.classes ?? []} />
    </div>
  );
}
