// Server-rolled dice (e.g. the automatic concentration save, #41) go through this single function so there's one place the backend reads randomness.
export function rollDie(faces: number): number {
  return 1 + Math.floor(Math.random() * faces);
}
