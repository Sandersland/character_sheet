// Roll-mode taxonomy shared by conditions (srd) and active-effect buffs (combat):
// a state can grant advantage/disadvantage on a class of d20 roll, optionally
// narrowed to one ability. Merged into the derived rollModifiers list on read
// (serializeCharacter) and resolved per roll on the frontend (lib/rollMode.ts).

export type RollAdvantage = "advantage" | "disadvantage";

/** The four d20 roll categories a state can bind to. */
export type RollModeKind = "attack" | "check" | "save" | "initiative";

/** One advantage/disadvantage grant; `ability` (lowercase key) narrows it to a single ability. */
export interface RollEffect {
  mode: RollAdvantage;
  kind: RollModeKind;
  ability?: string;
}

/** A RollEffect resolved with its provenance label (e.g. "Rage", "Poisoned"). */
export interface RollModifier extends RollEffect {
  source: string;
}
