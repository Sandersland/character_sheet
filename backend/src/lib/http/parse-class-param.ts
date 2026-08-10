import type { Request, Response } from "express";

/**
 * Parse the OPTIONAL `?class=` query param for the spell catalog (#1377).
 * Writes the 400 itself on an unusable value.
 *
 * Same shape and rationale as parseMaxSpellLevelOr400: the whole request in (so
 * "no route reads `req.query` itself" stays a structural property), a
 * discriminated result out (absent is success — the unfiltered catalog is what
 * the sheet's learn-from-catalog picker wants).
 *
 * Lowercased here because `SpellClass.className` is stored lowercase, so the
 * caller's casing must never reach the query. An unknown class name is NOT an error: the
 * catalog legitimately answers "no such spells" with an empty list, and
 * validating against the class table would make a pure catalog read depend on it.
 */
export function parseClassFilterOr400(
  req: Pick<Request, "query">,
  res: Response,
): { ok: true; className?: string } | { ok: false } {
  const raw = req.query.class;
  if (raw === undefined) return { ok: true };
  if (typeof raw !== "string" || raw.trim() === "") {
    res.status(400).json({ error: "Invalid class: must be a non-empty class name" });
    return { ok: false };
  }
  return { ok: true, className: raw.trim().toLowerCase() };
}

/**
 * Parse the OPTIONAL `?subclassId=` query param for the spell catalog (#1631)
 * — a chosen subclass's SubclassSpellListExpansion widens the choosable pool
 * beyond `?class=`'s own membership check (PHB'14 Warlock patrons). Same
 * shape/rationale as parseClassFilterOr400: absent is success (no widening,
 * the majority case). Unlike `?class=`, an unknown/mismatched id is NOT an
 * error here either — the route's own widening query legitimately answers
 * "no extra spells" for an id that doesn't resolve, same posture
 * parseClassFilterOr400 takes for an unknown class name.
 */
export function parseSubclassIdParam(
  req: Pick<Request, "query">,
  res: Response,
): { ok: true; subclassId?: string } | { ok: false } {
  const raw = req.query.subclassId;
  if (raw === undefined) return { ok: true };
  if (typeof raw !== "string" || raw.trim() === "") {
    res.status(400).json({ error: "Invalid subclassId: must be a non-empty id" });
    return { ok: false };
  }
  return { ok: true, subclassId: raw.trim() };
}

/**
 * Parse the OPTIONAL `?classes=` query param for the feat catalog (#1495) — a
 * comma-separated list of class names, used to gate the offered Fighting
 * Style set via fightingStyleFeatOfferedForClasses (lib/srd/feats.ts).
 * Absent is success (no filtering — every non-fighting_style Feat.classes is
 * always `[]`, unrestricted, so omitting it changes nothing for those rows).
 *
 * Unlike parseClassFilterOr400 above, no lowercasing happens here:
 * Feat.classes is matched case-insensitively downstream by the rule
 * function itself, not by a stored-lowercase convention like SpellClass.className.
 */
export function parseClassesParam(
  req: Pick<Request, "query">,
  res: Response,
): { ok: true; classNames?: string[] } | { ok: false } {
  const raw = req.query.classes;
  if (raw === undefined) return { ok: true };
  // A repeated `?classes=` key (or `?classes[]=`) parses as an array under
  // Express's extended query parser, not a string — name that specific
  // reason rather than a generic "must be non-empty" message, which reads as
  // though nothing was supplied when in fact several values were.
  if (Array.isArray(raw)) {
    res.status(400).json({ error: "Invalid classes: expected a single comma-separated string, not a repeated/array query value" });
    return { ok: false };
  }
  if (typeof raw !== "string" || raw.trim() === "") {
    res.status(400).json({ error: "Invalid classes: must be a non-empty comma-separated class name list" });
    return { ok: false };
  }
  const classNames = raw.split(",").map((c) => c.trim()).filter((c) => c.length > 0);
  if (classNames.length === 0) {
    res.status(400).json({ error: "Invalid classes: must be a non-empty comma-separated class name list" });
    return { ok: false };
  }
  return { ok: true, classNames };
}

/**
 * Parse the OPTIONAL `?characterId=` query param for the spell catalog
 * (#1811, epic #1795 9/9) — gives GET /api/spells campaign context so a spell
 * shared/granted into that character's campaign, or a DM's CAMPAIGN override,
 * reaches the picker. Same shape as parseSubclassIdParam: absent is success
 * (the majority case — the route's viewer then has no campaign, exactly as
 * before this slice). Ownership is NOT checked here — that stays
 * assertCharacterAccess's job at the route, so 404-vs-403 resolves against
 * real character data rather than this parser guessing.
 */
export function parseCharacterIdParam(
  req: Pick<Request, "query">,
  res: Response,
): { ok: true; characterId?: string } | { ok: false } {
  const raw = req.query.characterId;
  if (raw === undefined) return { ok: true };
  if (typeof raw !== "string" || raw.trim() === "") {
    res.status(400).json({ error: "Invalid characterId: must be a non-empty id" });
    return { ok: false };
  }
  return { ok: true, characterId: raw.trim() };
}
