import { Router } from "express";

import { prisma } from "@/lib/core/prisma.js";
import { requireEditionOr400 } from "@/lib/http/parse-edition-param.js";
import { resolveEditionCatalog, withEditionOrShared } from "@/lib/rules/catalog-edition.js";
import { readAbilityCost } from "@/lib/spellcasting/ability-cost.js";

export const subclassChoicesRouter = Router({ mergeParams: true });

// Feeds the level-up ceremony's subclassChoice step (via fetchSubclassChoiceOptions): lists the option catalog for one generic subclass choice, as GrantedAbility rows keyed by `source` = DerivedSubclassChoice.catalogSource.
// `cost`/`alwaysKnown` are additive projection fields — sources with no cost columns resolve via readAbilityCost to `{ kind: "none" }`, and alwaysKnown reads its column default (false).
// Mirrors GET /api/maneuvers, including the deliberate asymmetry with crossEditionRejection: a list read has no player intent to contradict, a supplied id does.
subclassChoicesRouter.get("/:source", async (req, res) => {
  const edition = requireEditionOr400(req, res);
  if (edition === undefined) return;

  const { source } = req.params;
  const rows = await prisma.grantedAbility.findMany({
    where: withEditionOrShared({ source }, edition),
    orderBy: { name: "asc" },
  });
  const options = resolveEditionCatalog(rows, edition, (row) => row.name);

  res.json(
    options.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      minLevel: row.minLevel,
      alwaysKnown: row.alwaysKnown,
      cost: readAbilityCost(row),
    })),
  );
});
