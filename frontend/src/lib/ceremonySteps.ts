// Pure rail model shared by the level-up and creation ceremonies (#1176). No
// JSX; rendered by CeremonyStepRail. Position is keyed by string (never index)
// so a re-plan that inserts/removes steps doesn't move the player.

export type CeremonyStepState = "done" | "active" | "pending";

export interface RailStep {
  key: string;
  label: string;
}

/** The index `currentKey` names, falling back to the first step for an unknown key. */
export function stepPosition(keys: string[], currentKey: string): number {
  const found = keys.indexOf(currentKey);
  return found === -1 ? 0 : found;
}

/** Per-step rail state, index-aligned with `keys`. */
export function railState(keys: string[], currentKey: string): CeremonyStepState[] {
  const current = stepPosition(keys, currentKey);
  return keys.map((_, i) => (i < current ? "done" : i === current ? "active" : "pending"));
}
