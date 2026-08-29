import { Router } from "express";

import { readAbilityCost } from "@/lib/spellcasting/ability-cost.js";
import { shadowArtEffectSpec } from "@/lib/classes/shadow-arts.js";
import { prisma } from "@/lib/core/prisma.js";
import { requireEditionOr400 } from "@/lib/http/parse-edition-param.js";
import { resolveEditionCatalog, withEditionOrShared } from "@/lib/rules/catalog-edition.js";

export const shadowArtsRouter = Router({ mergeParams: true });

// Mirrors GET /api/maneuvers, including the deliberate asymmetry with crossEditionRejection: a list read has no player intent to contradict, a supplied id does.
shadowArtsRouter.get("/", async (req, res) => {
  const edition = requireEditionOr400(req, res);
  if (edition === undefined) return;

  const rows = await prisma.grantedAbility.findMany({
    where: withEditionOrShared({ source: "shadowArts" }, edition),
    orderBy: [{ name: "asc" }],
  });
  const arts = resolveEditionCatalog(rows, edition, (row) => row.name);

  res.json(
    arts.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      minLevel: row.minLevel,
      cost: readAbilityCost(row),
      effect: shadowArtEffectSpec(row),
    })),
  );
});
