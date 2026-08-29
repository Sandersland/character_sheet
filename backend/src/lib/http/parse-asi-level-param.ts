import type { Request, Response } from "express";

import { MAX_LEVEL } from "@/lib/leveling/experience.js";

// Optional ?asiLevel= (#1438): absent is success (serves the whole edition catalog); an out-of-range level is rejected rather than clamped, since that's a caller bug the wire should name.
export function parseAsiLevelOr400(
  req: Pick<Request, "query">,
  res: Response,
): { ok: true; asiLevel?: number } | { ok: false } {
  const raw = req.query.asiLevel;
  if (raw === undefined) return { ok: true };
  const asiLevel = Number(raw);
  if (!Number.isInteger(asiLevel) || asiLevel < 1 || asiLevel > MAX_LEVEL) {
    res.status(400).json({
      error: `Invalid asiLevel: must be an integer between 1 and ${MAX_LEVEL}`,
    });
    return { ok: false };
  }
  return { ok: true, asiLevel };
}
