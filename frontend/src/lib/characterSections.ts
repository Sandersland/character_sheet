import type { Character } from "@/types/character";

export function hasProficiencies(character: Character): boolean {
  return (
    character.toolProficiencies.length > 0 ||
    (character.resources?.toolProfChoiceCount ?? 0) > 0 ||
    (character.armorProficiencies?.length ?? 0) > 0 ||
    (character.weaponProficiencies?.length ?? 0) > 0
  );
}

export function hasAdvancements(character: Character): boolean {
  return character.advancementSlots.total > 0 || character.advancements.length > 0;
}
