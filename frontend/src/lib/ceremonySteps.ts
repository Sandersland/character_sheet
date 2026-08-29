// Keyed by string, never index — a re-plan that inserts/removes steps must not move the player (#1176).
export type CeremonyStepState = "done" | "active" | "pending";

export interface RailStep {
  key: string;
  label: string;
}

export function stepPosition(keys: string[], currentKey: string): number {
  const found = keys.indexOf(currentKey);
  return found === -1 ? 0 : found;
}

export function railState(keys: string[], currentKey: string): CeremonyStepState[] {
  const current = stepPosition(keys, currentKey);
  return keys.map((_, i) => (i < current ? "done" : i === current ? "active" : "pending"));
}
