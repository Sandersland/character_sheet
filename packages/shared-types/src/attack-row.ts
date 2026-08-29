// A row carries no display strings (no attackLabel/damageLabel, no
// " (two-handed)"/"(off-hand)" suffix) — casing differs per surface.

import type { RollEventAttackComponents, RollEventDamageComponents } from "./roll-event.js";

/** Which family a row belongs to; a "weapon" row is backed by an equipped inventory item. */
export type AttackRowKind = "weapon" | "unarmed" | "improvised";

/** Which grip a weapon's damage die was resolved for — a versatile weapon swaps die when the off-hand is free. */
export type WeaponGrip = "one-handed" | "two-handed" | "versatile-two-handed";

/** Structurally assignable to the frontend's `RollSpec` without importing it — the same shape `EffectRoll.roll` puts on the wire. */
export interface AttackRollSpec {
  count: number;
  faces: number;
  modifier: number;
}

/** Present only while `isItemActive` gates the item's capabilities; `condition` (e.g. "vs dragons") is reminder text only — no enemy/target model. */
export interface AttackDamageRider {
  id: string;
  spec: AttackRollSpec;
  damageType?: string;
  condition?: string;
}

/**
 * `id` is the owning inventory row's id (or the literal "unarmed"/"improvised")
 * persisted in attack-tally `formId`s, so it must stay byte-stable; the
 * off-hand row shares its weapon's `id` rather than a suffixed one — consumers
 * partition on `offHand`, never on `id`. Emit order is load-bearing: equipped
 * weapons in inventory order, then off-hand, then unarmed, then improvised —
 * the turn sheet reads the first row for its main-weapon summary.
 */
export interface AttackRow {
  id: string;
  kind: AttackRowKind;
  /** The item name, unadorned — no grip or off-hand suffix. */
  name: string;
  attackSpec: AttackRollSpec;
  damageSpec: AttackRollSpec;
  damageType: string;
  /** Weapon rows only — unarmed and improvised strikes have no grip. */
  grip?: WeaponGrip;
  /** Strike counts as magical (Monk Empowered Strikes); only the unarmed row ever sets it. */
  magical: boolean;
  /** `damageSpec`/`damageComponents` already have the ability modifier dropped; row presence isn't action availability — turn eligibility is the gated action row's business. */
  offHand: boolean;
  damageRiders: AttackDamageRider[];
  /** Decomposed to-hit/damage math for the combat-log drill-in — weapon rows only. */
  attackComponents?: RollEventAttackComponents;
  damageComponents?: RollEventDamageComponents;
}
