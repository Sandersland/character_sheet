import type { Request, Response } from "express";

import { isRulesEdition } from "@/lib/rules/edition.js";
import type { RulesEdition } from "@character-sheet/shared-types";

/**
 * Resolve a REQUIRED `?edition=` query param (#1412): on a missing or
 * unrecognized value it writes the 400 and returns undefined, so the caller
 * bails with `if (edition === undefined) return;` — the same contract as
 * parseBodyOr400, deliberately, so a route reads the two the same way.
 *
 * Takes the whole request rather than the raw param value: that is what makes
 * "no route reads `req.query.edition` itself" a structural property (and a
 * greppable one) instead of a convention each new route may or may not follow.
 * A route that re-derived the param inline would also be a new clone pair under
 * `.fallowrc.jsonc`'s `duplicates.minOccurrences: 2`, so the single-helper shape
 * is load-bearing rather than stylistic.
 *
 * Seam note: when a second required query param appears, extract the shared
 * missing-param 400 HERE — one generic `requireQueryParam` this helper delegates
 * to — never by re-adding an inline parse at the new route. A generic helper is
 * not pre-built because an unused export fails fallow's unused-exports gate.
 */
export function requireEditionOr400(req: Pick<Request, "query">, res: Response): RulesEdition | undefined {
  const raw = req.query.edition;
  if (raw === undefined) {
    res.status(400).json({ error: "Missing required query parameter: edition" });
    return undefined;
  }
  if (!isRulesEdition(raw)) {
    res.status(400).json({ error: `Unknown edition: ${String(raw)}` });
    return undefined;
  }
  return raw;
}
