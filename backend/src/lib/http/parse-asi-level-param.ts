import type { Request, Response } from "express";

import { MAX_LEVEL } from "@/lib/leveling/experience.js";

/**
 * Parse the OPTIONAL `?asiLevel=` query param (#1438). Writes the 400 itself on
 * an unusable value.
 *
 * Takes the whole request, matching requireEditionOr400 for its reason: that is
 * what keeps "no route reads `req.query` itself" a structural, greppable
 * property rather than a convention each new route may skip.
 *
 * Returns a discriminated result where requireEditionOr400 returns
 * `RulesEdition | undefined`, and the divergence is the point: for a REQUIRED
 * param `undefined` is unambiguously the bail signal, but here `undefined` is a
 * legal outcome — no param means "serve the whole edition catalog", which is
 * what the non-ASI feat consumers read — so absent and invalid need separate
 * channels. That also means this helper does NOT belong behind
 * requireEditionOr400's seam note about extracting a shared missing-param 400:
 * there is no missing-param 400 to share, because absent is success here.
 *
 * A level outside 1..MAX_LEVEL is rejected rather than clamped: a caller asking
 * about level 25 has a bug the wire should name, and clamping would answer a
 * question it never asked.
 */
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
