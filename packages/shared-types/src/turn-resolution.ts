// Assembled only from wire values the serializer already supplies — the resolver composes this by copying already-served fields, never re-deriving a 5e rule.
// Deliberately excludes the design spec's illustrative `commit(rolls)` member — that's a function supplied by the resolver hook, not part of this package's data contract.

import type { AttackRollSpec } from "./attack-row.js";
import type { RollEventAttackComponents, RollEventDamageComponents } from "./roll-event.js";

/** Action-economy slot a resolution spends — the three slots the turn hub tracks. */
export type TurnResolutionCostKind = "action" | "bonusAction" | "reaction";

/** Served per spell entry so `cost.kind` is never a client-side parse of `castingTime` text; "other" covers rituals/minutes/hours. */
export type SpellCastCostKind = "action" | "bonusAction" | "reaction" | "other";

export interface TurnResolutionCost {
  kind: TurnResolutionCostKind;
  /** Extra Attack count (weapons only) — the served `Character.attacksPerAction`. */
  attacks?: number;
}

/** To-hit d20 parameters — present for a weapon swing or an attack-roll spell. */
export interface TurnResolutionToHit {
  bonus: number;
  critRange: number;
  /** Echoed unchanged into a `resolveAction` event's `toHit.components` — the same breakdown roll-log's `attackComponents` carries; optional since only weapon rows serve it today. */
  components?: RollEventAttackComponents;
}

/** Saving-throw parameters announced to the DM — present for a save-shaped spell. */
export interface TurnResolutionSave {
  dc: number;
  ability: string;
}

/** Already-resolved dice: the served `AttackRow.damageSpec` for a weapon, or `EffectRoll.roll` for the spell's chosen slot level; absent for a no-roll utility resolution (Druidcraft). */
export interface TurnResolutionEffect {
  spec: AttackRollSpec;
  kind: "damage" | "heal";
  /** Damage type — absent for a heal. */
  damageType?: string;
  /** Same echo-through-unchanged treatment as `TurnResolutionToHit.components`; absent for a spell effect (only weapon rows serve it today) and always absent for a heal. */
  components?: RollEventDamageComponents;
}

/** Present only for a multi-instance cast (Magic Missile's darts, Scorching Ray's rays, Eldritch Blast's beams, #1981/#1983) — `count` and `roll` are copied verbatim off the served `EffectRoll.instanceCount`/`instanceRoll` for the chosen slot level, never computed client-side. `effect.spec` stays PER-INSTANCE dice; the rail rolls it once per instance ("each") or once and fans the result out ("once"). */
export interface TurnResolutionInstances {
  count: number;
  roll: "each" | "once";
}

/** `toHit`/`save` are mutually exclusive: a weapon swing or attack-roll spell sets `toHit`, a saving-throw spell sets `save`, an auto-hit or no-roll spell sets neither; `effect` is absent for a no-roll resolution. */
export interface TurnResolution {
  source: string;
  cost: TurnResolutionCost;
  toHit?: TurnResolutionToHit;
  save?: TurnResolutionSave;
  effect?: TurnResolutionEffect;
  instances?: TurnResolutionInstances;
}
