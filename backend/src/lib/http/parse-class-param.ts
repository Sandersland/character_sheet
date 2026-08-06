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
