import { Router } from "express";

import { prisma } from "@/lib/core/prisma.js";
import { parseAsiLevelOr400 } from "@/lib/http/parse-asi-level-param.js";
import { parseClassesParam } from "@/lib/http/parse-class-param.js";
import { requireEditionOr400 } from "@/lib/http/parse-edition-param.js";
import { resolveEditionCatalog } from "@/lib/rules/catalog-edition.js";
import { featOfferedForAsiSlot, fightingStyleFeatOfferedForClasses, type FeatCategory } from "@/lib/srd/feats.js";

export const featsRouter = Router();

// GET /api/feats
// `?edition=` required (400 if absent or unrecognized). `?asiLevel=` optional:
// filters to the ASI-slot-legal set for that level. `?classes=` optional:
// filters to fightingStyleFeatOfferedForClasses. The two together 400 rather
// than silently combining, since asiLevel's filter already strips every
// fighting_style row before classes could apply.
featsRouter.get("/feats", async (req, res) => {
  const edition = requireEditionOr400(req, res);
  if (edition === undefined) return;

  const parsedAsiLevel = parseAsiLevelOr400(req, res);
  if (!parsedAsiLevel.ok) return;
  const { asiLevel } = parsedAsiLevel;

  const parsedClasses = parseClassesParam(req, res);
  if (!parsedClasses.ok) return;
  const { classNames } = parsedClasses;

  if (asiLevel !== undefined && classNames !== undefined) {
    res.status(400).json({
      error: "Invalid classes: cannot be combined with asiLevel — asiLevel never offers a Fighting Style row",
    });
    return;
  }

  const feats = await prisma.feat.findMany({
    orderBy: { name: "asc" },
  });
  const resolved = resolveEditionCatalog(feats, edition, (f) => f.name);
  const asiFiltered =
    asiLevel === undefined
      ? resolved
      : resolved.filter((row) =>
          featOfferedForAsiSlot(
            { category: row.category as FeatCategory, levelPrerequisite: row.levelPrerequisite },
            asiLevel,
          ),
        );
  const offered =
    classNames === undefined
      ? asiFiltered
      : asiFiltered.filter((row) => fightingStyleFeatOfferedForClasses(row, classNames, edition));

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
