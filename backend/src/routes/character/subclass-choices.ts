import { Router } from "express";

import { prisma } from "@/lib/core/prisma.js";
import { requireEditionOr400 } from "@/lib/http/parse-edition-param.js";
import { resolveEditionCatalog, withEditionOrShared } from "@/lib/rules/catalog-edition.js";
import { readAbilityCost } from "@/lib/spellcasting/ability-cost.js";

export const subclassChoicesRouter = Router({ mergeParams: true });

// Feeds the level-up ceremony's subclassChoice step (#1422, via
// fetchSubclassChoiceOptions) -- its only client today. GET
// /api/subclass-choices/:source lists the option catalog for one generic
// subclass choice (e.g. "huntersPrey"), as GrantedAbility rows keyed by `source`
// = the DerivedSubclassChoice.catalogSource. Which choices a character can make and how
// many is carried by the serialized character's resources.subclassChoices; this
// route supplies the pickable options. Alphabetical.
//
// `cost`/`alwaysKnown` (#1503): additive projection fields so a ki/focus-cost
// source (today: "discipline") can offer amounts in the picker — every other
// source's rows carry no cost columns, so readAbilityCost resolves them to
// `{ kind: "none" }` and alwaysKnown reads its column default (false).
//
// Mounted top-level, so `?edition=` is REQUIRED and a cross-edition row is
// omitted SILENTLY (#1412) — both for the reasons spelled out at maneuversRouter,
// including the deliberate asymmetry with crossEditionRejection: a list read has
// no player intent to contradict, a supplied id does.
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
