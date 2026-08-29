import CharacterSheetContent from "@/features/character-meta/CharacterSheetContent";
import { CharacterRouteGate } from "@/hooks/CharacterRouteGate";

export default function CharacterSheetPage() {
  return (
    <CharacterRouteGate>
      <CharacterSheetContent />
    </CharacterRouteGate>
  );
}
