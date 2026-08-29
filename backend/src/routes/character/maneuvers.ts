import { Router } from "express";

import { prisma } from "@/lib/core/prisma.js";
import { requireEditionOr400 } from "@/lib/http/parse-edition-param.js";
import { resolveEditionCatalog, withEditionOrShared } from "@/lib/rules/catalog-edition.js";

export const maneuversRouter = Router({ mergeParams: true });

// `?edition=` is required: there is no `:id` here to read a Character's rulesEdition from. A row belonging to the other edition is omitted silently — deliberately asymmetric with crossEditionRejection, which 400s a client-supplied cross-edition id.
maneuversRouter.get("/", async (req, res) => {
  const edition = requireEditionOr400(req, res);
  if (edition === undefined) return;

  const rows = await prisma.grantedAbility.findMany({
    where: withEditionOrShared({ source: "maneuver" }, edition),
    orderBy: { name: "asc" },
  });
  const maneuvers = resolveEditionCatalog(rows, edition, (row) => row.name);

  res.json(
    maneuvers.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      placement: row.placement,
      actionSlot: row.actionSlot,
      saveAbility: row.saveAbility,
    }))
  );
});
