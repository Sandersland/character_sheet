import { Router } from "express";

import { prisma } from "@/lib/core/prisma.js";
import { requireEditionOr400 } from "@/lib/http/parse-edition-param.js";
import { resolveEditionCatalog, withEditionOrShared } from "@/lib/rules/catalog-edition.js";

export const maneuversRouter = Router({ mergeParams: true });

// Feeds the resources section's "learn a maneuver" picker — same role as
// GET /api/spells for the spellbook. GrantedAbility rows (source "maneuver"),
// carrying the placement/action metadata the session UI routes on. Alphabetical.
//
// Mounted top-level, so `?edition=` is REQUIRED (#1412) — there is no `:id` here
// to read a Character's rulesEdition from, and the catalog is edition-scoped
// rather than character-scoped. Absent 400s rather than serving unfiltered:
// optional-with-fallback is exactly how the next caller silently reintroduces a
// cross-edition picker, with no gate that would catch it.
//
// A row belonging to the OTHER edition is omitted SILENTLY — per
// resolveEditionRow's documented semantics it is simply "not in this
// character's catalog". Deliberately asymmetric with crossEditionRejection,
// which 400s a client-SUPPLIED cross-edition id (#1345/#1414): a list read has
// no player intent to contradict, a supplied id does.
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
