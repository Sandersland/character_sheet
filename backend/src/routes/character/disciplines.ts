import { Router } from "express";

import { disciplineCastSteps, disciplineEffectSpec } from "@/lib/classes/disciplines.js";
import { readAbilityCost } from "@/lib/spellcasting/ability-cost.js";
import { prisma } from "@/lib/core/prisma.js";
import { requireEditionOr400 } from "@/lib/http/parse-edition-param.js";
import { resolveEditionCatalog, withEditionOrShared } from "@/lib/rules/catalog-edition.js";

export const disciplinesRouter = Router({ mergeParams: true });

// Feeds the Way of the Four Elements monk's discipline picker/cast UI (#1505)
// — mirrors GET /api/shadow-arts exactly: each row carries its embedded ki
// cost (AbilityCost) and resolved EffectSpec, PLUS `steps` — every
// selectable ki amount paired with its resolved roll (disciplineCastSteps),
// so the client's cast picker never computes `base + step * dicePerStep`
// itself. Ordered by minLevel then name so the UI can group by tier without
// a client-side sort.
//
// Mounted top-level, so `?edition=` is REQUIRED and a cross-edition row is
// omitted SILENTLY (#1412) — both for the reasons spelled out at
// maneuversRouter, including the deliberate asymmetry with
// crossEditionRejection: a list read has no player intent to contradict, a
// supplied id does.
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
