import type { abilityRows } from "@/lib/abilityAssignment";
import type { CharacterDraft } from "@/hooks/useCharacterDraft";

export type AbilityRowData = ReturnType<typeof abilityRows>[number];
export type Update = (patch: Partial<CharacterDraft>) => void;
