import type { Character } from "@/types/character";

// Whether the Proficiencies card has anything to show (or a pending tool choice).
export function hasProficiencies(character: Character): boolean {
  return (
    character.toolProficiencies.length > 0 ||
    (character.resources?.toolProfChoiceCount ?? 0) > 0 ||
    (character.armorProficiencies?.length ?? 0) > 0 ||
    (character.weaponProficiencies?.length ?? 0) > 0
  );
}

// Whether the Advancements card has slots or recorded advancements to show.
export function hasAdvancements(character: Character): boolean {
  return character.advancementSlots.total > 0 || character.advancements.length > 0;
}
