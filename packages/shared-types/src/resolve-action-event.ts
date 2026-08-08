// resolveAction event data (#1829 backend, #1830 frontend feed) — the wire
// shape of `data` on a `resolveAction` CharacterEvent (category "combat").
// Mirrors backend/src/lib/combat/resolve-action-ops.ts's
// `resolveActionOperationSchema` exactly: the persisted event is written
// straight from the validated op (`actionId`, `source`, `cost`, `toHit`,
// `save`, `effect`, `riders`, `slotLevel`), so this type is the op schema's
// shape minus the `type: "resolveAction"` literal the op carries and the
// route validates.
//
// ONE `effect` roll per resolution — no `instances[]` array (settled
// 2026-08-08, per #1828 review). Magic Missile's three darts are one
// `count: 3` spec; `effect.faces` is every die actually rolled, so the
// drill-in reads the per-dart breakdown straight off `faces` without a
// dedicated instances model. `riders` (#1843) is the ADDITIVE exception to
// "one effect": a weapon's typed elemental rider (Flame Tongue +2d6 fire,
// Divine Smite radiant, Hunter's Mark, sneak attack) is a genuinely different
// SECOND damage type stacked on the primary `effect`, not another same-type
// instance — `riders` defaults to empty/omitted, never a reversal of the
// no-`instances[]` decision above.

import type { RollEventAttackComponents, RollEventDamageComponents } from "./roll-event.js";

/** Action-economy slot a resolution spends, plus an Extra-Attack count. */
export interface ResolveActionEventCost {
  kind: "action" | "bonus" | "reaction";
  attacks?: number;
}

/**
 * A d20 roll already resolved client-side (trusted-roll contract #406 — the
 * frontend rolls, the server records and validates ranges, never re-rolls).
 * `faces` is every die actually rolled (2 entries under advantage/
 * disadvantage), `kept` the face value that counts; `bonus` is the resolved
 * flat total added to the die — already-summed server-served math. `components`
 * is the OPTIONAL decomposed breakdown (reused from the roll-event wire type,
 * #1235) — an adapter (#1832/#1833) populates it when it has one; a renderer
 * falls back to the flat `bonus` line when it's absent.
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

/** A saving throw announced to the DM — no target model, so no roll of the caster's own (self-or-announce, CLAUDE.md). */
export interface ResolveActionEventSave {
  dc: number;
  ability: string;
}

/**
 * One damage/heal roll. `spec` is the served dice spec text (e.g. "3d4+3");
 * `faces` is every die rolled — `faces.length >= 1` covers a multi-die spec
 * (Magic Missile) without a dedicated instances array, see the module banner.
 * `components` is the OPTIONAL decomposed addend breakdown (reused from the
 * roll-event wire type, #1235); when absent, a renderer floors to `spec`'s own
 * trailing `+N`/`-N` modifier so the drill-in still reconciles to `total`.
 */
export interface ResolveActionEventEffect {
  spec: string;
  faces: number[];
  total: number;
  type: string;
  kind: "damage" | "heal";
  crit: boolean;
  components?: RollEventDamageComponents;
}

/** `data` on a `resolveAction` CharacterEvent (category "combat"). */
export interface ResolveActionEventData {
  actionId: string;
  source: string;
  cost: ResolveActionEventCost;
  toHit?: ResolveActionEventToHit | null;
  save?: ResolveActionEventSave | null;
  effect?: ResolveActionEventEffect | null;
  /**
   * Typed damage riders (#1843) stacked ON TOP of the primary `effect` —
   * each its own damage TYPE (not another same-type instance, see the module
   * banner). Absent/empty for the common no-rider swing; a renderer sums
   * `effect` + every `riders[]` term into one consolidated sentence and gives
   * each term its own drill-in line.
   */
  riders?: ResolveActionEventEffect[];
  /** Present only for a leveled spell cast/upcast — absent for a cantrip or weapon swing. */
  slotLevel?: number | null;
  /**
   * The character's own spellcasting entry id (#1833, spell adapter) —
   * present only for a spell resolution; a weapon swing omits it. Its
   * presence, not `slotLevel`'s, is what the backend keys off to run the
   * spell's full side-effect sequence (concentration set/displace, a buff
   * spell's self-buff, slot/arcanum spend via the same payer castSpell
   * uses) through `castAbilityInTx` — a cantrip cast has no `slotLevel` but
   * still needs `entryId` for that sequence to run at all.
   */
  entryId?: string;
  /**
   * Where a cast's rolled effect lands: the caster's own HP, or a consenting
   * ally's sheet (heal only, #462) — mirrors `CastSpellOperation.apply`
   * (spellcasting.ts) exactly, since the backend forwards it there
   * unchanged. Never set for a damage resolution: there is no target/enemy
   * model (self-or-announce, CLAUDE.md) — a damage spell's effect is
   * announced only, never auto-applied.
   */
  apply?: { target: "self" | { characterId: string }; kind: "heal" | "damage"; amount: number };
}
