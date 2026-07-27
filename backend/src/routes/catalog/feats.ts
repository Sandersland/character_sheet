import { Router } from "express";

import { prisma } from "@/lib/core/prisma.js";
import { resolveEditionCatalog } from "@/lib/rules/catalog-edition.js";
import { isRulesEdition } from "@/lib/rules/edition.js";
import type { RulesEdition } from "@character-sheet/shared-types";

export const featsRouter = Router();

// Feeds the advancement section's feat picker — same role as GET /api/maneuvers.
// Ordered alphabetically server-side.
//
// `?edition=` is OPTIONAL and unused by today's frontend caller (useFeatCatalog
// fetches once, flat, with no character in view — the same "genuinely no
// per-request character" gap reference.ts documents for subclassLevel), so
// omitting it returns every row exactly as before: a real regression risk
// otherwise. When PRESENT it must be a real edition — a typo silently falling
// back to unfiltered would give the caller no signal at all — so an
// unrecognized value 400s rather than degrading to the omitted-param
// behavior. When valid, resolves through resolveEditionCatalog — the same
// exact-then-NULL-fallback ordering every other catalog read uses — rather
// than leaving this route to hand-roll a second copy once a picker actually
// threads a character's edition through (#1310/#1286).
featsRouter.get("/feats", async (req, res) => {
  const rawEdition = req.query.edition;
  let edition: RulesEdition | undefined;
  if (rawEdition !== undefined) {
    if (!isRulesEdition(rawEdition)) {
      res.status(400).json({ error: `Unknown edition: ${String(rawEdition)}` });
      return;
    }
    edition = rawEdition;
  }

  const feats = await prisma.feat.findMany({
    orderBy: { name: "asc" },
  });
  const resolved = edition ? resolveEditionCatalog(feats, edition, (f) => f.name) : feats;

  res.json(
    resolved.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      category: row.category,
      levelPrerequisite: row.levelPrerequisite ?? undefined,
      repeatable: row.repeatable,
      prerequisite: row.prerequisite ?? undefined,
      abilityOptions: row.abilityOptions,
      abilityIncrease: row.abilityIncrease,
      improvements: row.improvements,
    })),
  );
});
