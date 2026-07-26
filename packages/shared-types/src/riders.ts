// Rider wire type (#1316) — the single cross-tier shape for every "rider":
// a bolt-on effect that piggybacks on an attack or a hit and costs no action
// economy of its own (Sneak Attack, Stunning Strike, Open Hand Technique,
// Quivering Palm, Battle Master's maneuverSaveDC). See actions.ts's
// DERIVED_ACTIONS header for why riders never live in that registry.
//
// Emitted only when the character currently has the rider — absent when
// off-class/subclass/level, never `null`. Vocabulary is deliberately minimal
// (availability via presence, saveDC, a dice spec) — no effect/duration/target
// fields; those are epic #416's axes, added only when a subclass demands them.
export interface Rider {
  /** DC of the save the rider forces on a hit, when it forces one. */
  saveDC?: number;
  /** Bonus dice the rider adds (e.g. Sneak Attack's Nd6). */
  dice?: { count: number; faces: number };
  /** Whether the rider is currently primed/active (e.g. Quivering Palm's set vibrations). */
  active?: boolean;
}
