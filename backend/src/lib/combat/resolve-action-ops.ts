/**
 * resolveAction op schema (#1829) — wire shape for POST /api/characters/:id/resolve-action/transactions.
 * Backend-local, not `@character-sheet/contracts`, mirroring `castSpellOpSchema` staying local to its own route.
 *
 * Current contract (#1982): a single-instance op (a weapon swing, Fire Bolt) carries its roll at the top
 * level, `toHit`/`effect`. A multi-instance op (Magic Missile's darts, Scorching Ray's rays, Eldritch
 * Blast's beams, #1981) carries them in `instances[]` instead, each element cross-checked by the SAME
 * `resolveActionToHitSchema`/`resolveActionEffectSchema` as the top-level fields. The two are mutually
 * exclusive (superRefine below) — an op has EITHER top-level `toHit`/`effect` OR `instances`, never both.
 * Either way it's still one op, one undoable `CharacterEvent`, and one slot spend, regardless of instance count.
 *
 * `riders` (#1843) are additive typed damage riders on top of the primary roll (top-level `effect` OR the
 * summed `instances`), each validated via `resolveActionEffectSchema` — cast-level and rolled once, never
 * per-instance (no per-instance rider mechanic exists yet, epic #1986).
 * `entryId`/`apply` are present only for a spell resolution, routing through `castSpellForResolutionInTx`'s
 * `castAbilityInTx` sequence so concentration/buff/apply side effects still run. `apply` mirrors
 * `castSpellOpSchema`'s own shape exactly so the two never drift.
 */
import { z } from "zod";

import { attackComponentsSchema, damageComponentsSchema } from "@/lib/session/roll-components.js";
import { standaloneRollOperationSchema } from "./standalone-roll-op.js";

const resolveActionCostSchema = z.object({
  kind: z.enum(["action", "bonus", "reaction"]),
  attacks: z.number().int().positive().optional(),
});

// A d20 roll already resolved client-side (trusted-roll contract #406 — the
// frontend rolls, the server records and validates ranges, never re-rolls).
// `faces` is every die actually rolled (2 entries under advantage/
// disadvantage), `kept` the one that counts. `components` (RollEventAttackComponents)
// is optional/nullable like every other resolveAction sub-object, echoed
// through unchanged from the served attack bonus.
//
// The three checks below reject internally-inconsistent client input the
// server can verify without a target/AC (self-or-announce): a nat20 flag
// that doesn't match the kept die, a kept die not among the rolled faces,
// and a nat20 not called as a crit. The converse (crit ⇒ nat20) is NOT
// enforced — a crit can be a DM-ruled non-nat20 hit.
const resolveActionToHitSchema = z
  .object({
    faces: z.array(z.number().int().min(1).max(20)).min(1),
    kept: z.number().int().min(1).max(20),
    nat20: z.boolean(),
    bonus: z.number().int(),
    total: z.number().int(),
    verdict: z.enum(["hit", "miss", "crit"]),
    components: attackComponentsSchema.nullable().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.nat20 !== (val.kept === 20)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["nat20"],
        message: "nat20 must equal (kept === 20)",
      });
    }
    if (!val.faces.includes(val.kept)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["kept"],
        message: "kept must be one of the rolled faces",
      });
    }
    if (val.nat20 && val.verdict !== "crit") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["verdict"],
        message: "a natural 20 must be called as a crit",
      });
    }
  });

const resolveActionSaveSchema = z.object({
  dc: z.number().int().positive(),
  ability: z.string().min(1),
});

// One damage/heal roll. `spec` is the served dice spec text (e.g. "3d4+3");
// `faces` is every die rolled — count(faces) >= 1 covers a multi-die spec
// within ONE roll (e.g. Magic Missile pre-#1981's combined 3d4). A
// per-instance breakout of separately-rolled dice uses `instances[]`
// instead, each element its own instance of this same schema. `components`
// (RollEventDamageComponents) is optional/nullable, echoed through like toHit.components.
const resolveActionEffectSchema = z.object({
  spec: z.string().min(1),
  faces: z.array(z.number().int().positive()).min(1),
  total: z.number().int(),
  type: z.string().min(1),
  kind: z.enum(["damage", "heal"]),
  crit: z.boolean(),
  components: damageComponentsSchema.nullable().optional(),
  // Attributing display name for a riders[] term ("Sneak Attack") — echoed
  // verbatim into the event for the drill-in label; absent on the primary
  // effect, whose attribution is the op-level `source`.
  source: z.string().min(1).optional(),
});

// One instance's rolls within an `instances[]` op — same shape as the op's own top-level toHit/effect,
// reusing their schemas (and superRefine cross-checks) verbatim per instance.
const resolveActionInstanceSchema = z.object({
  toHit: resolveActionToHitSchema.nullable().optional(),
  effect: resolveActionEffectSchema.nullable().optional(),
});

const resolveActionOperationSchema = z
  .object({
    type: z.literal("resolveAction"),
    // Client-generated id correlating this resolution's rolls across the rail
    // steps (useResolution, #1831) — opaque to the backend, stored verbatim.
    actionId: z.string().min(1),
    // Display name of the resolved thing ("Fire Bolt", "Longbow").
    source: z.string().min(1),
    cost: resolveActionCostSchema,
    toHit: resolveActionToHitSchema.nullable().optional(),
    save: resolveActionSaveSchema.nullable().optional(),
    effect: resolveActionEffectSchema.nullable().optional(),
    // Typed damage riders (#1843) — zero or more, each validated as its own
    // effect. Omitted/empty for the common no-rider swing.
    riders: z.array(resolveActionEffectSchema).optional(),
    // Multi-instance roll set (#1981/#1982) — mutually exclusive with the top-level
    // toHit/effect (superRefine below). min(1): an empty `instances: []` would make
    // "instanced" vacuous and indistinguishable from omitting the field, so it's
    // rejected rather than silently treated as un-instanced.
    instances: z.array(resolveActionInstanceSchema).min(1).optional(),
    // Present only for a leveled spell cast (or upcast) — expends one slot of
    // this level via the same payer castSpell uses. Absent for a cantrip or a
    // weapon swing, which have no character state to spend.
    slotLevel: z.number().int().min(1).max(9).optional(),
    // The character's own spellcasting entry id — present only for a spell
    // resolution (#1833). Its presence, not `slotLevel`'s, is what routes the
    // op through castSpellForResolutionInTx: a cantrip cast has no slotLevel
    // but still needs entryId so concentration/buff side effects apply.
    entryId: z.string().min(1).optional(),
    // Where a cast's rolled effect lands: the caster's own HP, or a consenting
    // ally's sheet (heal only, #462) — mirrors castSpellOpSchema's own `apply`
    // exactly. Never set for a damage resolution: there is no target/enemy
    // model (self-or-announce), so a damage spell's effect is announced only, never auto-applied.
    apply: z
      .object({
        target: z.union([z.literal("self"), z.object({ characterId: z.string().min(1) })]),
        kind: z.enum(["heal", "damage"]),
        amount: z.number().int().positive(),
      })
      .optional(),
    // 2014 Assassin Assassinate (#1526) — see ResolveActionEventData.assassinate for the full contract.
    // Wire-shape consistency only here (assassinate ⇒ verdict crit); ELIGIBILITY (is this character
    // even a 2014 Assassin L3+) needs the character row, so that check lives in
    // applyResolveActionOperations' applyOp, not this schema.
    assassinate: z.boolean().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.assassinate && val.toHit?.verdict !== "crit") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["assassinate"],
        message: "assassinate requires toHit.verdict to be crit",
      });
    }
    if (val.instances && (val.toHit != null || val.effect != null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["instances"],
        message: "instances is mutually exclusive with top-level toHit/effect",
      });
    }
  });

export type ResolveActionOperation = z.infer<typeof resolveActionOperationSchema>;

// The resolve-action endpoint's request op union (#1861): a combat resolution
// (`resolveAction`) or a standalone player roll (`logRoll`) — check/save/
// initiative/tally-damage, migrated off the retired session-roll route so they
// commit through THIS one resolver as real batched, trivially-undoable events.
export const resolveActionRequestOperationSchema = z.discriminatedUnion("type", [
  resolveActionOperationSchema,
  standaloneRollOperationSchema,
]);

export type ResolveActionRequestOperation = z.infer<typeof resolveActionRequestOperationSchema>;
