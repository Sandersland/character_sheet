import type { Request, Response } from "express";

// Cantrips are level 0, so the legal band is 0..9 inclusive — do NOT copy parseAsiLevelOr400's `< 1` floor here, which would 400 a cantrip-only request.
const MAX_SPELL_LEVEL = 9;

// Optional ?maxLevel= (#1377): absent is success (whole catalog); an out-of-band value is rejected rather than clamped since it's a caller bug.
export function parseMaxSpellLevelOr400(
  req: Pick<Request, "query">,
  res: Response,
): { ok: true; maxLevel?: number } | { ok: false } {
  const raw = req.query.maxLevel;
  if (raw === undefined) return { ok: true };
  // Number("") is 0, and 0 is a legal value here, so the blank/non-string guard is load-bearing — without it `?maxLevel=` would silently mean cantrips only.
  const maxLevel = typeof raw === "string" && raw.trim() !== "" ? Number(raw) : NaN;
  if (!Number.isInteger(maxLevel) || maxLevel < 0 || maxLevel > MAX_SPELL_LEVEL) {
    res.status(400).json({
      error: `Invalid maxLevel: must be an integer between 0 and ${MAX_SPELL_LEVEL}`,
    });
    return { ok: false };
  }
  return { ok: true, maxLevel };
}
