import CharacterSheetContent from "@/features/character-meta/CharacterSheetContent";
import { CharacterRouteGate } from "@/hooks/CharacterRouteGate";

// Everything below CharacterRouteGate's guard (including reference data) is
// read via hooks, not props (#1284 C17).
export default function CharacterSheetPage() {
  return (
    <CharacterRouteGate>
      <CharacterSheetContent />
    </CharacterRouteGate>
  );
}
