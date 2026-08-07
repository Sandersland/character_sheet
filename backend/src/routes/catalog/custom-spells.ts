import type { Request, Response } from "express";
import { Router } from "express";
import { customSpellSchema, type CustomSpellInput } from "@character-sheet/contracts";

import { Prisma, type Spell } from "@/generated/prisma/client.js";
import { assertSpellOwnership } from "@/lib/auth/access.js";
import { parseBodyOr400 } from "@/lib/http/parse-body.js";
import { prisma } from "@/lib/core/prisma.js";
import { reconcileSpellClasses } from "@/lib/spellcasting/spell-classes.js";
import {
  validateCustomSpellClasses,
  validateCustomSpellCoherence,
} from "@/lib/spellcasting/custom-spell-validation.js";

// User-owned homebrew spell CRUD (#1785, epic #1782 2/5): campaign-style
// ownership-scoped plain REST (campaigns.ts's pattern) — NOT the character
// `POST …/transactions` pattern, since a homebrew spell is reusable catalog
// content shared across ALL of a user's characters, never one character's
// mutable state. No audit log, no transaction-op shape.
//
// PATCH performs a FULL replace of every editable field via the SAME
// customSpellSchema as POST, never a partial merge: the structured-effect
// coherence rules (validateCustomSpellCoherence) must hold on the record as a
// whole, and a full-replace lets create and edit share one validator instead
// of a merge-then-validate path that would need to re-fetch the existing row
// anyway to check the merged result.
//
// `ownerId`/`edition` are never accepted from the client — customSpellSchema
// carries neither field and is `.strict()`, so a client attempting to set
// them 400s at the parse step rather than being silently ignored. GET
// /api/spells is untouched here (#1786's job) — this router owns only the
// three mutation endpoints.

export const customSpellsRouter = Router();

// The 9 structured-effect columns, all nullable on the Spell model. Named
// once here and walked by both nullableEffectFields (write) and
// undefinedEffectFields (serialize) below — a loop over one list instead of
// nine hand-written `??` sites apiece, which is what drove custom-spells.ts's
// own functions over the complexity/CRAP ceiling before this extraction.
const EFFECT_FIELD_NAMES = [
  "effectKind",
  "effectDiceCount",
  "effectDiceFaces",
  "effectModifier",
  "damageType",
  "attackType",
  "saveAbility",
  "saveEffect",
  "upcastDicePerLevel",
] as const satisfies readonly (keyof CustomSpellInput & keyof Spell)[];
type EffectFieldName = (typeof EFFECT_FIELD_NAMES)[number];
type NullableEffectFields = Pick<Spell, EffectFieldName>;
type UndefinedEffectFields = { [K in EffectFieldName]: Spell[K] | undefined };

function nullableEffectFields(data: CustomSpellInput): NullableEffectFields {
  const out = {} as Record<EffectFieldName, unknown>;
  for (const name of EFFECT_FIELD_NAMES) {
    out[name] = data[name] ?? null;
  }
  // TS can't narrow a Record write keyed by a union loop variable back to the
  // per-field union NullableEffectFields declares — every value above came
  // straight from CustomSpellInput's own typed fields (or null), so this is
  // the single controlled cast back to that shape, not an escape hatch.
  return out as NullableEffectFields;
}

function undefinedEffectFields(row: Spell): UndefinedEffectFields {
  const out = {} as Record<EffectFieldName, unknown>;
  for (const name of EFFECT_FIELD_NAMES) {
    out[name] = row[name] ?? undefined;
  }
  // Same cast rationale as nullableEffectFields above.
  return out as UndefinedEffectFields;
}

// Shared by POST's create and PATCH's update: every editable column except
// ownerId/edition (server-forced, POST-only) and the structured-effect
// columns (nullableEffectFields above).
function customSpellWriteData(data: CustomSpellInput) {
  return {
    name: data.name,
    level: data.level,
    school: data.school,
    castingTime: data.castingTime,
    range: data.range,
    duration: data.duration,
    description: data.description,
    concentration: data.concentration ?? false,
    ritual: data.ritual ?? false,
    components: data.components ?? Prisma.JsonNull,
    ...nullableEffectFields(data),
  };
}

function serializeCustomSpell(row: Spell, classes: string[]) {
  return {
    id: row.id,
    ownerId: row.ownerId,
    edition: row.edition,
    name: row.name,
    level: row.level,
    school: row.school,
    castingTime: row.castingTime,
    range: row.range,
    duration: row.duration,
    description: row.description,
    concentration: row.concentration,
    ritual: row.ritual,
    components: row.components,
    classes,
    ...undefinedEffectFields(row),
  };
}

// The two DB-dependent/coherence checks customSpellSchema itself can't
// express (see spell-ops.ts's own comment). Writes the 400 itself on a
// violation; returns false so the caller bails.
async function validateOrReject(data: CustomSpellInput, res: Response): Promise<boolean> {
  const coherenceError = validateCustomSpellCoherence(data);
  if (coherenceError) {
    res.status(400).json({ error: coherenceError });
    return false;
  }
  const classesError = await validateCustomSpellClasses(data.classes);
  if (classesError) {
    res.status(400).json({ error: classesError });
    return false;
  }
  return true;
}

// Shared by POST and PATCH: parse the body against customSpellSchema, then
// run validateOrReject. Both write a 400 themselves on failure; returns
// undefined so the caller bails the same way parseBodyOr400 alone would.
async function parseAndValidate(req: Request, res: Response): Promise<CustomSpellInput | undefined> {
  const data = parseBodyOr400(customSpellSchema, req.body, res);
  if (data === undefined) return undefined;
  if (!(await validateOrReject(data, res))) return undefined;
  return data;
}

/**
 * POST /api/spells/custom
 * Create a homebrew spell. `ownerId` = the caller, `edition` = "EDITION_2014"
 * (epic #1782's locked spec — homebrew is 2014-only for this slice). The spell
 * row and its SpellClass rows commit atomically ($transaction): a mid-write
 * failure must never leave a spell with wrong/missing class memberships.
 */
customSpellsRouter.post("/spells/custom", async (req, res) => {
  const data = await parseAndValidate(req, res);
  if (data === undefined) return;

  const { spell, classes } = await prisma.$transaction(async (tx) => {
    const created = await tx.spell.create({
      data: { ...customSpellWriteData(data), edition: "EDITION_2014", ownerId: req.user!.id },
    });
    // reconcileSpellClasses normalizes classNames (lowercase, dedupe) — the
    // ONLY place that happens; its returned list is what the response below
    // echoes back, rather than a second normalization pass on data.classes.
    const classes = await reconcileSpellClasses(tx, created.id, data.classes);
    return { spell: created, classes };
  });

  res.status(201).json(serializeCustomSpell(spell, classes));
});

/**
 * PATCH /api/spells/custom/:id
 * Full-field replace of an owned homebrew spell. 404 if the spell doesn't
 * exist, 403 if it exists but isn't the caller's (including any seeded
 * ownerId: null row). Same atomic-write guarantee as POST above.
 */
customSpellsRouter.patch("/spells/custom/:id", async (req, res) => {
  await assertSpellOwnership(prisma, req.user!.id, req.params.id);

  const data = await parseAndValidate(req, res);
  if (data === undefined) return;

  const { spell, classes } = await prisma.$transaction(async (tx) => {
    const updated = await tx.spell.update({
      where: { id: req.params.id },
      data: customSpellWriteData(data),
    });
    const classes = await reconcileSpellClasses(tx, updated.id, data.classes);
    return { spell: updated, classes };
  });

  res.json(serializeCustomSpell(spell, classes));
});

/**
 * DELETE /api/spells/custom/:id
 * Cascade-deletes its SpellClass rows (schema relation, onDelete: Cascade).
 * Same 404/403 ownership check as PATCH.
 */
customSpellsRouter.delete("/spells/custom/:id", async (req, res) => {
  await assertSpellOwnership(prisma, req.user!.id, req.params.id);

  await prisma.spell.delete({ where: { id: req.params.id } });
  res.status(204).end();
});
