// Presence signals availability (absent when off-class/subclass/level, never null) — vocabulary is deliberately minimal: no effect/duration/target fields.

/** A rider that adds bonus dice to a hit (e.g. Sneak Attack's Nd6). */
export interface DiceRider {
  dice: { count: number; faces: number };
}

/** `active` is never an availability signal (presence of the rider already means available) — it's self-state the rider set itself (e.g. Quivering Palm's vibrations), and no other rider currently sets it. */
export interface SaveRider {
  saveDC: number;
  active?: boolean;
}

/** Every rider shape currently in play. */
export type Rider = DiceRider | SaveRider;
