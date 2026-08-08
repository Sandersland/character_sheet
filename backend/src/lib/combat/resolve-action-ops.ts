/**
 * resolveAction op schema (#1829) — the wire shape for
 * POST /api/characters/:id/resolve-action/transactions. Backend-local (not
 * `@character-sheet/contracts`) even now that a real frontend caller exists
 * (#1832, `frontend/src/api/combat.ts`) — mirrors `castSpellOpSchema` staying
 * local to routes/character/spellcasting.ts while its own frontend caller
 * imports a structurally-matching plain type (`ResolveActionEventData`,
 * shared-types, #1830) rather than the validating schema itself. The
 * frontend's `ResolveActionOperation` = that shared type + the op's literal
 * `type` discriminant.
 *
 * Shape settled in the epic's design note (2026-08-08, per #1828 review): ONE
 * `effect` roll per resolution — no `instances[]` array. Magic Missile's three
 * darts are one `count: 3` spec; the persisted roll's `faces` breakdown is
 * what a future drill-in reads, not a per-dart entry.
 */
import { z } from "zod";

import { attackComponentsSchema, damageComponentsSchema } from "@/lib/session/roll-components.js";

const resolveActionCostSchema = z.object({
  kind: z.enum(["action", "bonus", "reaction"]),
  attacks: z.number().int().positive().optional(),
});

// A d20 roll already resolved client-side (trusted-roll contract #406 — the
// frontend rolls, the server records and validates ranges, never re-rolls).
// `faces` is every die actually rolled (2 entries under advantage/
// disadvantage), `kept` the one that counts. `components` is the decomposed
// to-hit math (RollEventAttackComponents) — optional/nullable like every
// other resolveAction sub-object; the adapter slices (#1832/#1833) populate
// it from the served weapon/spell attack bonus, echoed through unchanged
// (server-provided, not client-derived — CLAUDE.md's rules-are-backend-owned
// still holds, this is just the log's addend breakdown for the drill-in).
//
// The three checks below reject internally-inconsistent client input the
// server CAN verify without a target/AC (self-or-announce, CLAUDE.md): a
// nat20 flag that doesn't match the kept die, a kept die that isn't even
// among the rolled faces, and a nat20 not called as a crit. The converse
// (verdict === "crit" ⇒ nat20) is NOT enforced — a crit can be a DM-ruled
// non-nat20 hit the engine has no target/AC to verify against.
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
// `faces` is every die rolled, `count(faces) >= 1` covers a multi-die spec
// (Magic Missile) without a dedicated instances array — see the module banner.
// `components` is the decomposed damage math (RollEventDamageComponents) —
// same optional/nullable, server-provided-echo treatment as toHit.components.
const resolveActionEffectSchema = z.object({
  spec: z.string().min(1),
  faces: z.array(z.number().int().positive()).min(1),
  total: z.number().int(),
  type: z.string().min(1),
  kind: z.enum(["damage", "heal"]),
  crit: z.boolean(),
  components: damageComponentsSchema.nullable().optional(),
});

export const resolveActionOperationSchema = z.object({
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
  // Present only for a leveled spell cast (or upcast) — expends one slot of
  // this level via the same payer castSpell uses. Absent for a cantrip or a
  // weapon swing, which have no character state to spend.
  slotLevel: z.number().int().min(1).max(9).optional(),
});

export type ResolveActionOperation = z.infer<typeof resolveActionOperationSchema>;
