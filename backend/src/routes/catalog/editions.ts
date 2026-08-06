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
 *
 * The rules editions a character or campaign can be created on, in display
 * order, with the copy the picker renders — plus the edition to pre-select.
 *
 * Deliberately edition-INDEPENDENT, and cannot ride `GET /api/reference`
 * (#1436): `referenceRouter` 400s when `edition` is absent, and `edition` is the
 * very thing `EditionPicker` exists to let the user choose, so this must be
 * answerable *before* an edition is settled.
 *
 * `defaultEdition` is served from `DEFAULT_RULES_EDITION`, never from
 * `RULES_EDITION_DISPLAY_ORDER[0]`: display order is a product choice while the
 * default mirrors `Character.rulesEdition`'s Prisma `@default`, and the client
 * writes it to an irreversible field.
 */
editionsRouter.get("/editions", (_req, res) => {
  // `_req` is unused on purpose and the handler reads no query at all — mapping
  // the module const straight into the response, with nothing per-request
  // reaching it, is what makes it provable at a glance that `?edition=` cannot
  // change this answer (same style as referenceRouter's itemRarities).
  res.json({
    defaultEdition: DEFAULT_RULES_EDITION,
    editions: RULES_EDITION_DISPLAY_ORDER.map((key) => ({
      key,
      label: RULES_EDITION_LABELS[key],
      description: EDITION_DESCRIPTIONS[key],
    })),
  });
});
