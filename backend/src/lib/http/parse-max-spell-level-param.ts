import type { Request, Response } from "express";

/**
 * Highest spell level 5e defines. Cantrips are level 0, so the legal band is
 * 0..9 inclusive — do NOT copy parseAsiLevelOr400's `< 1` floor here, which
 * would 400 a perfectly legitimate cantrip-only request.
 */
const MAX_SPELL_LEVEL = 9;

/**
 * Parse the OPTIONAL `?maxLevel=` query param for the spell catalog (#1377).
 * Writes the 400 itself on an unusable value.
 *
 * Takes the whole request and returns a discriminated result for the same two
 * reasons parseAsiLevelOr400 does: it keeps "no route reads `req.query` itself"
 * a structural property, and absent is SUCCESS here (no filter means the whole
 * catalog, which the sheet's learn-from-catalog picker wants) so absent and
 * invalid need separate channels.
 *
 * Out-of-band values are rejected rather than clamped: a caller asking for
 * level 12 has a bug the wire should name.
 */
export function parseMaxSpellLevelOr400(
  req: Pick<Request, "query">,
  res: Response,
): { ok: true; maxLevel?: number } | { ok: false } {
  const raw = req.query.maxLevel;
  if (raw === undefined) return { ok: true };
  // The blank/non-string guard is load-bearing where parseAsiLevelOr400 needs
  // none: `Number("")` is 0, and 0 is a LEGAL value here, so `?maxLevel=` would
  // otherwise silently mean "cantrips only".
  const maxLevel = typeof raw === "string" && raw.trim() !== "" ? Number(raw) : NaN;
  if (!Number.isInteger(maxLevel) || maxLevel < 0 || maxLevel > MAX_SPELL_LEVEL) {
    res.status(400).json({
      error: `Invalid maxLevel: must be an integer between 0 and ${MAX_SPELL_LEVEL}`,
    });
    return { ok: false };
  }
  return { ok: true, maxLevel };
}
