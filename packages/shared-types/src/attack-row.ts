// Server-resolved attack rows (#1434) — one row per way the character can swing:
// each equipped weapon, the Two-Weapon Fighting off-hand swing, Unarmed Strike,
// and Improvised Weapon, with every number already computed. The client formats
// these; it never re-derives attack math.
//
// A row deliberately carries NO display strings — no attackLabel/damageLabel, no
// roll-source or log-source label, no " (two-handed)"/" (off-hand)" suffix. The
// decision record is `AttackEntry`'s docstring in the frontend's attackMath.ts:
// those strings are cased differently per surface ("Unarmed strike attack" is the
// dice-engine roll label, "Unarmed Strike" the Session Log source), so one served
// string would force one casing on both.

import type { RollEventAttackComponents, RollEventDamageComponents } from "./roll-event.js";

/** Which family a row belongs to; a "weapon" row is backed by an equipped inventory item. */
export type AttackRowKind = "weapon" | "unarmed" | "improvised";

/** Which grip a weapon's damage die was resolved for — a versatile weapon swaps die when the off-hand is free. */
export type WeaponGrip = "one-handed" | "two-handed" | "versatile-two-handed";

/**
 * A resolved dice roll on a row. Structurally assignable to the frontend
 * `RollSpec` without importing it — the same shape `EffectRoll.roll` already
 * puts on the wire (#1381).
 */
export interface AttackRollSpec {
  count: number;
  faces: number;
  modifier: number;
}

/**
 * One dice-valued on-hit rider a weapon adds to its damage roll (Flame Tongue
 * +2d6 fire), rolled as a separate typed term. Present only while the item's
 * capabilities are active — the gate is `isItemActive`, so an unattuned
 * attunement item serves no riders at all. `condition` (e.g. "vs dragons") is
 * reminder text, never auto-gated: there is no enemy/target model.
 */
export interface AttackDamageRider {
  id: string;
  spec: AttackRollSpec;
  damageType?: string;
  condition?: string;
}

/**
 * One attack row.
 *
 * `id` is the owning inventory row's id for a weapon row and the literal
 * "unarmed"/"improvised" for those two. All three are persisted as attack-tally
 * `formId`s, so they must stay byte-stable across releases — which is also why
 * the off-hand row deliberately SHARES its weapon's `id` rather than taking a
 * suffixed one: a new id would orphan in-flight tally rows. Consumers partition
 * on `offHand`, never on `id`.
 *
 * Emit order is load-bearing — the turn sheet's main-weapon summary reads the
 * first row: equipped weapons in inventory order, then the off-hand row when one
 * exists, then unarmed, then improvised.
 */
export interface AttackRow {
  id: string;
  kind: AttackRowKind;
  /** The item name, unadorned — no grip or off-hand suffix (see this file's header). */
  name: string;
  attackSpec: AttackRollSpec;
  damageSpec: AttackRollSpec;
  damageType: string;
  /** Weapon rows only — unarmed and improvised strikes have no grip. */
  grip?: WeaponGrip;
  /** Strike counts as magical (Monk Empowered Strikes); only the unarmed row ever sets it. */
  magical: boolean;
  /**
   * The single Two-Weapon Fighting off-hand row — its `damageSpec`/
   * `damageComponents` already have the ability modifier dropped
   * (`deriveOffHandDamage`). Row presence is not action availability: whether
   * the swing may be taken this turn is the gated action row's business (#1435).
   */
  offHand: boolean;
  damageRiders: AttackDamageRider[];
  /** Decomposed to-hit/damage math for the combat-log drill-in (#1235) — weapon rows only. */
  attackComponents?: RollEventAttackComponents;
  damageComponents?: RollEventDamageComponents;
}
