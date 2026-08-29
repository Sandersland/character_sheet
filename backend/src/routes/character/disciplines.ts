import { Router } from "express";

import { disciplineCastSteps, disciplineEffectSpec } from "@/lib/classes/disciplines.js";
import { readAbilityCost } from "@/lib/spellcasting/ability-cost.js";
import { prisma } from "@/lib/core/prisma.js";
import { requireEditionOr400 } from "@/lib/http/parse-edition-param.js";
import { resolveEditionCatalog, withEditionOrShared } from "@/lib/rules/catalog-edition.js";

export const disciplinesRouter = Router({ mergeParams: true });

// Mirrors GET /api/shadow-arts. `steps` pairs every selectable ki amount with its resolved roll (disciplineCastSteps) so the client's cast picker never computes base + step * dicePerStep itself.
// `?edition=` is required; a cross-edition row is omitted silently — a list read has no player intent to contradict, unlike a supplied id (crossEditionRejection).
disciplinesRouter.get("/", async (req, res) => {
  const edition = requireEditionOr400(req, res);
  if (edition === undefined) return;

  const rows = await prisma.grantedAbility.findMany({
    where: withEditionOrShared({ source: "discipline" }, edition),
    orderBy: [{ minLevel: "asc" }, { name: "asc" }],
  });
  const disciplines = resolveEditionCatalog(rows, edition, (row) => row.name);

  res.json(
    disciplines.map((row) => {
      const cost = readAbilityCost(row);
      return {
        id: row.id,
        name: row.name,
        description: row.description,
        minLevel: row.minLevel,
        cost,
        effect: disciplineEffectSpec(row),
        steps: disciplineCastSteps(row, cost),
      };
    }),
  );
});
