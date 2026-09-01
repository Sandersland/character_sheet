// A single-instance resolution carries its roll at the top level (`toHit`/`effect`); a multi-instance one
// (Magic Missile's darts, Scorching Ray's rays, Eldritch Blast's beams, #1981/#1982) carries them in
// `instances[]` instead — the two are mutually exclusive at the op schema (resolveActionOperationSchema's
// superRefine). Either way it's still one op, one event, one slot spend.
// `riders` is the additive exception to both shapes: a second, differently-typed damage source (Flame Tongue's fire, Divine Smite, Hunter's Mark, sneak attack) stacked on top, cast-level and rolled once — never per-instance.

import type { RollEventAttackComponents, RollEventDamageComponents } from "./roll-event.js";

/** Action-economy slot a resolution spends, plus an Extra-Attack count. */
export interface ResolveActionEventCost {
  kind: "action" | "bonus" | "reaction";
  attacks?: number;
}

/**
 * Trusted-roll contract: the frontend rolls this d20, the server validates
 * ranges and records it, never re-rolls. `faces` holds every die actually
 * rolled (2 entries under advantage/disadvantage); `components` is optional/nullable —
 * a renderer without one falls back to the flat `bonus` line.
 */
export interface ResolveActionEventToHit {
  faces: number[];
  kept: number;
  nat20: boolean;
  bonus: number;
  total: number;
  verdict: "hit" | "miss" | "crit";
  components?: RollEventAttackComponents | null;
}

/** A saving throw announced to the DM — no target model, so no roll of the caster's own (self-or-announce). */
export interface ResolveActionEventSave {
  dc: number;
  ability: string;
}

/**
 * `spec` is the served dice spec text (e.g. "3d4+3"); `faces` is every die
 * rolled — length >= 1 covers a multi-die spec without a separate instances
 * array. `components` is optional/nullable — absent or null, a renderer floors
 * to `spec`'s trailing modifier so the drill-in still reconciles to `total`.
 */
export interface ResolveActionEventEffect {
  spec: string;
  faces: number[];
  total: number;
  type: string;
  kind: "damage" | "heal";
  crit: boolean;
  components?: RollEventDamageComponents | null;
  /** Display label for a riders[] term (e.g. "Sneak Attack") shown instead of the bare damage type; absent on the primary effect and on riders persisted before this field existed. */
  source?: string;
}

/** One instance's rolls within a multi-instance cast's `instances[]` — same per-roll shape as the op's own top-level `toHit`/`effect`, just scoped to one dart/ray/beam instead of the whole resolution. */
export interface ResolveActionEventInstance {
  toHit?: ResolveActionEventToHit | null;
  effect?: ResolveActionEventEffect | null;
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
  /** Multi-instance cast rolls (#1981/#1982) — always an array (never undefined), same convention as `riders`. Absent/empty is the common single-instance case, rendered exactly as before; present only when the op carried `instances[]` instead of top-level `toHit`/`effect`. */
  instances?: ResolveActionEventInstance[];
  /** Present only for a leveled spell cast/upcast — absent for a cantrip or weapon swing. */
  slotLevel?: number | null;
  /** Always present (never omitted), null for a non-spell resolution — same always-a-value convention as `riders`/`instances`/`assassinate`. On the op, its presence (not `slotLevel`'s) is what `castAbilityInTx` keys off to run a spell's full side-effect sequence (concentration, self-buff, slot/arcanum spend) — a cantrip cast has no `slotLevel` but still needs `entryId`. */
  entryId?: string | null;
  /**
   * Mirrors `CastSpellOperation.apply` exactly — the backend forwards it there
   * unchanged. Never set for a damage resolution: there is no target/enemy
   * model (self-or-announce).
   */
  apply?: { target: "self" | { characterId: string }; kind: "heal" | "damage"; amount: number };
  /**
   * 2014-only (PHB'24/SRD 5.2 deleted Assassinate): declares the target
   * surprised, converting a hit into a crit. The server doesn't compute the
   * crit itself (no target/AC model); `applyResolveActionOperations` rejects
   * it when `assassinateEligible` says no, and the schema requires a crit
   * verdict on the top-level `toHit` or on at least one `instances[]` entry.
   */
  assassinate?: boolean;
}
