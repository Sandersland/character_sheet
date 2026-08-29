// Merged into the derived rollModifiers list on read (serializeCharacter); resolved per roll on the frontend.

export type RollAdvantage = "advantage" | "disadvantage";

export type RollModeKind = "attack" | "check" | "save" | "initiative";

// `ability` (lowercase key) narrows the grant to a single ability.
export interface AdvantageRollEffect {
  mode: RollAdvantage;
  kind: RollModeKind;
  ability?: string;
}

// e.g. 2024 exhaustion's −2×level (SRD 5.2).
export interface FlatRollEffect {
  mode: "flat";
  modifier: number;
  kind: RollModeKind;
  ability?: string;
}

export type RollEffect = AdvantageRollEffect | FlatRollEffect;

export type RollModifier = RollEffect & { source: string };
