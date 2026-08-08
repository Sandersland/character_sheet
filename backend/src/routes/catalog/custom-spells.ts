import type { Request, Response } from "express";
import { Router } from "express";
import { customSpellSchema, type CustomSpellInput } from "@character-sheet/contracts";

import { Prisma, type CatalogEntry, type Spell } from "@/generated/prisma/client.js";
import { assertSpellOwnership } from "@/lib/auth/access.js";
import { NotFoundError } from "@/lib/auth/errors.js";
import { parseBodyOr400 } from "@/lib/http/parse-body.js";
import { prisma } from "@/lib/core/prisma.js";
import { reconcileSpellClasses } from "@/lib/spellcasting/spell-classes.js";
import { nullableSpellEffectFields, undefinedSpellEffectFields } from "@/lib/spellcasting/spell-effect-fields.js";
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
// Ownership moved off Spell.ownerId onto the CatalogEntry entitlement
// supertype (#1796, epic #1795 1/6): POST creates a `scope: "USER"`
// CatalogEntry alongside the Spell row in the same transaction; PATCH keeps
// the entry's `name` in sync with a rename (its business key includes name);
// DELETE deletes the CatalogEntry, which cascades the Spell (and its
// SpellClass rows, via Spell's own cascade) rather than deleting the Spell
// directly — Spell.catalogEntryId carries no reverse cascade (the supertype
// stays closed, see schema.prisma's own comment).
//
// `ownerUserId`/`edition` are never accepted from the client — customSpellSchema
// carries neither field and is `.strict()`, so a client attempting to set
// them 400s at the parse step rather than being silently ignored. GET
// /api/spells is untouched here (#1786's job) — this router owns only the
// three mutation endpoints.

export const customSpellsRouter = Router();

// Shared by POST's create and PATCH's update: every editable column except
// ownerId/edition (server-forced, POST-only) and the structured-effect
// columns (nullableSpellEffectFields, lib/spellcasting/spell-effect-fields.ts
// — shared with spells.ts/fork.ts, #1815 review finding 5).
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
    ...nullableSpellEffectFields(data),
  };
}

function serializeCustomSpell(row: Spell, classes: string[], entry: CatalogEntry) {
  return {
    id: row.id,
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
    // SpellWire.catalog shape (#1796, shared-types/src/catalog.ts). `editable`
    // is always true here (#1808 leak-fix, epic #1795 8/9 combined-state
    // review) — POST always creates a fresh USER-scope row the caller owns,
    // and PATCH only ever reaches this line after assertSpellOwnership (POST
    // /PATCH /api/spells/custom/:id's own gate) already verified the SAME
    // rule isCatalogEntryEditable expresses (lib/catalog/entitlement.ts): a
    // request that failed that check never gets here to serialize a response.
    // No query needed to recompute a fact this route's own auth step already
    // established.
    catalog: { entryId: entry.id, scope: entry.scope, isFork: entry.forkedFromId !== null, forkedFromId: entry.forkedFromId, editable: true },
    ...undefinedSpellEffectFields(row),
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
 * Create a homebrew spell. Creates a `scope: "USER"` CatalogEntry (#1796) for
 * the caller alongside it, `edition` = "EDITION_2014" (epic #1782's locked
 * spec — homebrew is 2014-only for this slice). The entry, spell row, and its
 * SpellClass rows commit atomically ($transaction): a mid-write failure must
 * never leave a spell with wrong/missing class memberships or no entitlement
 * row at all.
 */
customSpellsRouter.post("/spells/custom", async (req, res) => {
  const data = await parseAndValidate(req, res);
  if (data === undefined) return;

  const { spell, classes, entry } = await prisma.$transaction(async (tx) => {
    const entry = await tx.catalogEntry.create({
      data: { kind: "SPELL", scope: "USER", ownerUserId: req.user!.id, name: data.name, edition: "EDITION_2014" },
    });
    const created = await tx.spell.create({
      data: { ...customSpellWriteData(data), edition: "EDITION_2014", catalogEntryId: entry.id },
    });
    // reconcileSpellClasses normalizes classNames (lowercase, dedupe) — the
    // ONLY place that happens; its returned list is what the response below
    // echoes back, rather than a second normalization pass on data.classes.
    const classes = await reconcileSpellClasses(tx, created.id, data.classes);
    return { spell: created, classes, entry };
  });

  res.status(201).json(serializeCustomSpell(spell, classes, entry));
});

/**
 * PATCH /api/spells/custom/:id
 * Full-field replace of an owned homebrew spell OR a CAMPAIGN-scope fork the
 * caller DMs (#1808, epic #1795 8/8). 404 if the spell doesn't exist, 403 if
 * it exists but the caller has neither editable path to it (including any
 * seeded GLOBAL row — assertSpellOwnership's own comment). Also renames the
 * linked CatalogEntry (its business key includes `name`) so a rename can't
 * leave the entry pointing at stale content.
 *
 * assertSpellOwnership runs as the TRANSACTION's OWN first statement, not a
 * separate call beforehand (#1815 review finding 7): the prior shape had a
 * TOCTOU window between that outer check and this transaction's writes — a
 * concurrent DELETE landing in between made `tx.catalogEntry.update` below
 * throw an uncaught P2025 (500) for a spell that, from the caller's own
 * perspective, no longer exists. Moving the check inside collapses the large
 * part of that window (no separate round-trip, and no parseAndValidate DB
 * work, in between); the catch below closes what's left — ANY mid-transaction
 * "record to update not found" maps to the same 404 assertSpellOwnership
 * itself would throw a moment later, never an uncaught 500.
 */
customSpellsRouter.patch("/spells/custom/:id", async (req, res) => {
  const data = await parseAndValidate(req, res);
  if (data === undefined) return;

  let result;
  try {
    result = await prisma.$transaction(async (tx) => {
      const owned = await assertSpellOwnership(tx, req.user!.id, req.params.id);
      const entry = await tx.catalogEntry.update({
        where: { id: owned.catalogEntryId },
        data: { name: data.name },
      });
      const updated = await tx.spell.update({
        where: { id: req.params.id },
        data: customSpellWriteData(data),
      });
      const classes = await reconcileSpellClasses(tx, updated.id, data.classes);
      return { spell: updated, classes, entry };
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      throw new NotFoundError("Spell not found");
    }
    throw err;
  }

  res.json(serializeCustomSpell(result.spell, result.classes, result.entry));
});

/**
 * DELETE /api/spells/custom/:id
 * Deletes the linked CatalogEntry, which cascades the Spell row (and its
 * SpellClass rows, via Spell's own cascade) — Spell.catalogEntryId carries no
 * reverse cascade, so deleting the Spell directly would orphan the entry.
 * Same 404/403 ownership check as PATCH (owned USER row, or a CAMPAIGN-scope
 * fork the caller DMs, #1808).
 */
customSpellsRouter.delete("/spells/custom/:id", async (req, res) => {
  const owned = await assertSpellOwnership(prisma, req.user!.id, req.params.id);

  await prisma.catalogEntry.delete({ where: { id: owned.catalogEntryId } });
  res.status(204).end();
});
