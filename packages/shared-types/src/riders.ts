// Rider wire type (#1316) — the single cross-tier shape for every "rider":
// a bolt-on effect that piggybacks on an attack or a hit and costs no action
// economy of its own (Sneak Attack, Stunning Strike, Open Hand Technique,
// Quivering Palm, Battle Master's maneuvers). See `DERIVED_ACTIONS` for why
// riders never live in that registry.
//
// Emitted only when the character currently has the rider — absent when
// off-class/subclass/level, never `null`. Vocabulary is deliberately minimal
// (availability via presence, saveDC, a dice spec) — no effect/duration/target
// fields; those are epic #416's axes, added only when a subclass demands them.
//
// Split into DiceRider/SaveRider rather than one type with every field
// optional: a rider that always carries dice when present (Sneak Attack)
// should say so at the type level, not rely on every reader adding an
// `?.` guard that can silently render "undefined" (#1316 review).

/** A rider that adds bonus dice to a hit (e.g. Sneak Attack's Nd6). */
export interface DiceRider {
  dice: { count: number; faces: number };
}

/**
 * A rider that forces a save. Presence of the field alone means the rider is
 * available — `active` is never a second availability signal, only character
 * self-state the rider itself set (e.g. Quivering Palm's set vibrations, via
 * its own `activeEffects` buff); no other rider currently sets it.
 */
export interface SaveRider {
  saveDC: number;
  active?: boolean;
}

/** Every rider shape currently in play. */
export type Rider = DiceRider | SaveRider;
