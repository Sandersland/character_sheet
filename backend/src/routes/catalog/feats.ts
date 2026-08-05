import { Router } from "express";

import { prisma } from "@/lib/core/prisma.js";
import { parseAsiLevelOr400 } from "@/lib/http/parse-asi-level-param.js";
import { requireEditionOr400 } from "@/lib/http/parse-edition-param.js";
import { resolveEditionCatalog } from "@/lib/rules/catalog-edition.js";
import { featOfferedForAsiSlot, type FeatCategory } from "@/lib/srd/feats.js";

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
//
// `?asiLevel=` is OPTIONAL (#1438): with it the response is exactly the
// ASI-slot-legal set for that level per featOfferedForAsiSlot, which is the
// picker's only gate now that the frontend mirror of that rule is deleted.
// Without it the whole edition catalog is served, because the non-ASI consumers
// need rows the ASI gate rejects by design — the Fighting Style picker reads
// fighting_style, and the level-up review step resolves an id to a name for an
// already-committed pick.
featsRouter.get("/feats", async (req, res) => {
  const edition = requireEditionOr400(req, res);
  if (edition === undefined) return;

  const parsedAsiLevel = parseAsiLevelOr400(req, res);
  if (!parsedAsiLevel.ok) return;
  const { asiLevel } = parsedAsiLevel;

  const feats = await prisma.feat.findMany({
    orderBy: { name: "asc" },
  });
  const resolved = resolveEditionCatalog(feats, edition, (f) => f.name);
  // Gate the raw row, not the mapped payload below: the payload turns a NULL
  // levelPrerequisite into `undefined`, which the rule reads the same way today
  // but needn't forever — the rule's input is the catalog row.
  const offered =
    asiLevel === undefined
      ? resolved
      : resolved.filter((row) =>
          featOfferedForAsiSlot(
            { category: row.category as FeatCategory, levelPrerequisite: row.levelPrerequisite },
            asiLevel,
          ),
        );

  res.json(
    offered.map((row) => ({
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
