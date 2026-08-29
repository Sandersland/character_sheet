import type { Request, Response } from "express";

import { isRulesEdition } from "@/lib/rules/edition.js";
import type { RulesEdition } from "@character-sheet/shared-types";

// Required ?edition= (#1412): missing or unrecognized writes the 400 and returns undefined, matching parseBodyOr400's `if (x === undefined) return;`.
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
