import type { Request, Response } from "express";
import { Router } from "express";
import { customSpellSchema, type CustomSpellInput } from "@character-sheet/contracts";

import { Prisma, type CatalogEntry, type Spell } from "@/generated/prisma/client.js";
import { assertCharacterAccess, assertSpellOwnership } from "@/lib/auth/access.js";
import { NotFoundError } from "@/lib/auth/errors.js";
import { parseBodyOr400 } from "@/lib/http/parse-body.js";
import { prisma } from "@/lib/core/prisma.js";
import { editionOf, type RulesEdition } from "@/lib/rules/edition.js";
import { reconcileSpellClasses } from "@/lib/spellcasting/spell-classes.js";
import { nullableSpellEffectFields, undefinedSpellEffectFields } from "@/lib/spellcasting/spell-effect-fields.js";
import {
  validateCustomSpellClasses,
  validateCustomSpellCoherence,
} from "@/lib/spellcasting/custom-spell-validation.js";

// customSpellSchema is `.strict()` and omits ownerUserId/edition, so a client attempting to set them 400s at parse.

export const customSpellsRouter = Router();

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
    // editable: true is safe here — assertSpellOwnership already enforced the same rule as isCatalogEntryEditable before this line runs.
    catalog: { entryId: entry.id, scope: entry.scope, isFork: entry.forkedFromId !== null, forkedFromId: entry.forkedFromId, editable: true },
    ...undefinedSpellEffectFields(row),
  };
}

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

async function parseAndValidate(req: Request, res: Response): Promise<CustomSpellInput | undefined> {
  const data = parseBodyOr400(customSpellSchema, req.body, res);
  if (data === undefined) return undefined;
  if (!(await validateOrReject(data, res))) return undefined;
  return data;
}

async function resolveAuthoringEdition(req: Request, res: Response): Promise<RulesEdition | undefined> {
  const characterId = req.query.characterId;
  if (typeof characterId !== "string" || characterId.trim().length === 0) {
    res.status(400).json({ error: "characterId is required to determine the spell's rules edition" });
    return undefined;
  }
  // "edit" (not "view"): authoring requires control of the character, not just read/share access.
  await assertCharacterAccess(prisma, req.user!.id, characterId, "edit");
  const character = await prisma.character.findUniqueOrThrow({
    where: { id: characterId },
    select: { rulesEdition: true },
  });
  return editionOf(character);
}

/**
 * POST /api/spells/custom?characterId=<id>
 * Creates a homebrew spell plus its `scope: "USER"` CatalogEntry. `edition` is
 * derived server-side from the character named by `characterId`, never from
 * the request body. Commits atomically.
 */
customSpellsRouter.post("/spells/custom", async (req, res) => {
  const edition = await resolveAuthoringEdition(req, res);
  if (edition === undefined) return;
  const data = await parseAndValidate(req, res);
  if (data === undefined) return;

  const { spell, classes, entry } = await prisma.$transaction(async (tx) => {
    const entry = await tx.catalogEntry.create({
      data: { kind: "SPELL", scope: "USER", ownerUserId: req.user!.id, name: data.name, edition },
    });
    const created = await tx.spell.create({
      data: { ...customSpellWriteData(data), edition, catalogEntryId: entry.id },
    });
    // reconcileSpellClasses is the only place classNames are normalized; echo its return, don't re-normalize data.classes.
    const classes = await reconcileSpellClasses(tx, created.id, data.classes);
    return { spell: created, classes, entry };
  });

  res.status(201).json(serializeCustomSpell(spell, classes, entry));
});

/**
 * PATCH /api/spells/custom/:id
 * Full-field replace of an owned homebrew spell or a CAMPAIGN-scope fork the
 * caller DMs. 404 if the spell doesn't exist, 403 if the caller has no
 * editable path to it. Also renames the linked CatalogEntry.
 *
 * assertSpellOwnership runs as the transaction's own first statement to avoid
 * a TOCTOU window with a concurrent delete; a mid-transaction "not found" maps
 * to the same 404.
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
 * Deletes the linked CatalogEntry, which cascades the Spell row. Same 404/403
 * ownership check as PATCH.
 */
customSpellsRouter.delete("/spells/custom/:id", async (req, res) => {
  const owned = await assertSpellOwnership(prisma, req.user!.id, req.params.id);

  await prisma.catalogEntry.delete({ where: { id: owned.catalogEntryId } });
  res.status(204).end();
});
