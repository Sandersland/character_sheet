import { Router } from "express";

import {
  DEFAULT_RULES_EDITION,
  EDITION_DESCRIPTIONS,
  RULES_EDITION_DISPLAY_ORDER,
  RULES_EDITION_LABELS,
} from "@/lib/rules/edition.js";

export const editionsRouter = Router();

/**
 * GET /api/editions
 * The rules editions a character or campaign can be created on, in display
 * order, with picker copy and the edition to pre-select. Takes no query
 * params — must be answerable before an edition is settled, unlike
 * `GET /api/reference`, which 400s without `?edition=`.
 *
 * `defaultEdition` is served from `DEFAULT_RULES_EDITION`, not
 * `RULES_EDITION_DISPLAY_ORDER[0]`: it mirrors `Character.rulesEdition`'s
 * Prisma `@default`, and the client writes it to an irreversible field.
 */
editionsRouter.get("/editions", (_req, res) => {
  res.json({
    defaultEdition: DEFAULT_RULES_EDITION,
    editions: RULES_EDITION_DISPLAY_ORDER.map((key) => ({
      key,
      label: RULES_EDITION_LABELS[key],
      description: EDITION_DESCRIPTIONS[key],
    })),
  });
});
