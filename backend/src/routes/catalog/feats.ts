import { Router } from "express";

import { prisma } from "@/lib/core/prisma.js";
import { resolveEditionCatalog } from "@/lib/rules/catalog-edition.js";
import { isRulesEdition } from "@/lib/rules/edition.js";
import type { RulesEdition } from "@character-sheet/shared-types";

export const featsRouter = Router();

// Feeds the advancement section's feat picker — same role as GET /api/maneuvers.
// Ordered alphabetically server-side.
//
// `?edition=` is REQUIRED (#1411), following referenceRouter's precedent
// (#1325): absent 400s, unrecognized 400s, and every served response goes
// through resolveEditionCatalog's exact-then-NULL-fallback ordering. Optional
// -with-unfiltered-fallback was rejected even though it reads as the safer
// migration: it makes the guard conventional rather than structural, because
// the next `fetchFeats()`-shaped caller silently reintroduces a flat cross
// -edition picker and nothing anywhere fails. A required param moves that
// mistake to compile time on the client and to a 400 on the wire.
featsRouter.get("/feats", async (req, res) => {
  const rawEdition = req.query.edition;
  if (rawEdition === undefined) {
    res.status(400).json({ error: "Missing required query parameter: edition" });
    return;
  }
  if (!isRulesEdition(rawEdition)) {
    res.status(400).json({ error: `Unknown edition: ${String(rawEdition)}` });
    return;
  }
  const edition: RulesEdition = rawEdition;

  const feats = await prisma.feat.findMany({
    orderBy: { name: "asc" },
  });
  const resolved = resolveEditionCatalog(feats, edition, (f) => f.name);

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
