/**
 * Server-side dice engine.
 *
 * Most rolls in this app are rolled on the client and the
 * raw value is POSTed to a transaction endpoint, which validates the range and
 * applies the rules math. A few rolls, however, must be made by the server with
 * no client input — e.g. the automatic Constitution saving throw to maintain
 * concentration when a concentrating character takes damage (issue #41). This
 * is the single place the backend reads a random number for a die roll, so all
 * server-rolled dice share one engine.
 */

/** Rolls a single die with the given number of faces (1..faces inclusive). */
export function rollDie(faces: number): number {
  return 1 + Math.floor(Math.random() * faces);
}
