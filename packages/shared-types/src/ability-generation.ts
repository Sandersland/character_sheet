// How the player produced their base (pre-species/background-bonus) ability
// scores at creation. Drives which rule the backend's validateAbilityScores
// applies to CreateCharacterInput.abilityScores; frontend's
// useCharacterDraft.AbilityMethod is the same union under a local name.
export type AbilityGenerationMethod = "standardArray" | "pointBuy" | "roll" | "manual";
