// One `effect` roll per resolution, no `instances[]` — e.g. Magic Missile's three darts are one `count: 3` spec, with `effect.faces` holding every die actually rolled.
// `riders` is the additive exception: a second, differently-typed damage source (Flame Tongue's fire, Divine Smite, Hunter's Mark, sneak attack) stacked on the primary `effect`, not another same-type instance.

import type { RollEventAttackComponents, RollEventDamageComponents } from "./roll-event.js";

/** Action-economy slot a resolution spends, plus an Extra-Attack count. */
export interface ResolveActionEventCost {
  kind: "action" | "bonus" | "reaction";
  attacks?: number;
}

/**
 * Trusted-roll contract: the frontend rolls this d20, the server validates
 * ranges and records it, never re-rolls. `faces` holds every die actually
 * rolled (2 entries under advantage/disadvantage); `components` is optional —
 * a renderer without it falls back to the flat `bonus` line.
 */
export interface ResolveActionEventToHit {
  faces: number[];
  kept: number;
  nat20: boolean;
  bonus: number;
  total: number;
  verdict: "hit" | "miss" | "crit";
  components?: RollEventAttackComponents;
}

/** A saving throw announced to the DM — no target model, so no roll of the caster's own (self-or-announce). */
export interface ResolveActionEventSave {
  dc: number;
  ability: string;
}

/**
 * `spec` is the served dice spec text (e.g. "3d4+3"); `faces` is every die
 * rolled — length >= 1 covers a multi-die spec without a separate instances
 * array. `components` is optional — absent, a renderer floors to `spec`'s
 * trailing modifier so the drill-in still reconciles to `total`.
 */
export interface ResolveActionEventEffect {
  spec: string;
  faces: number[];
  total: number;
  type: string;
  kind: "damage" | "heal";
  crit: boolean;
  components?: RollEventDamageComponents;
  /** Display label for a riders[] term (e.g. "Sneak Attack") shown instead of the bare damage type; absent on the primary effect and on riders persisted before this field existed. */
  source?: string;
}

/** `data` on a `resolveAction` CharacterEvent (category "combat"). */
export interface ResolveActionEventData {
  actionId: string;
  source: string;
  cost: ResolveActionEventCost;
  toHit?: ResolveActionEventToHit | null;
  save?: ResolveActionEventSave | null;
  effect?: ResolveActionEventEffect | null;
  /** Absent/empty for the common no-rider swing; a renderer sums `effect` + every rider into one sentence, each with its own drill-in line. */
  riders?: ResolveActionEventEffect[];
  /** Present only for a leveled spell cast/upcast — absent for a cantrip or weapon swing. */
  slotLevel?: number | null;
  /** Presence (not `slotLevel`'s) is what `castAbilityInTx` keys off to run a spell's full side-effect sequence (concentration, self-buff, slot/arcanum spend) — a cantrip cast has no `slotLevel` but still needs `entryId`. */
  entryId?: string;
  /**
   * Mirrors `CastSpellOperation.apply` exactly — the backend forwards it there
   * unchanged. Never set for a damage resolution: there is no target/enemy
   * model (self-or-announce).
   */
  apply?: { target: "self" | { characterId: string }; kind: "heal" | "damage"; amount: number };
  /**
   * 2014-only (PHB'24/SRD 5.2 deleted Assassinate): declares the target
   * surprised, converting this swing's hit into a crit. The server doesn't
   * compute the crit itself (no target/AC model); `applyResolveActionOperations`
   * rejects it when `assassinateEligible` says no, and the schema requires
   * `toHit.verdict === "crit"`.
   */
  assassinate?: boolean;
}
