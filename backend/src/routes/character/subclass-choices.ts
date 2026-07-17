import { Router } from "express";

import { prisma } from "@/lib/core/prisma.js";

export const subclassChoicesRouter = Router({ mergeParams: true });

// Feeds the level-up Choose-N step and the sheet's subclass-choice pickers (#899):
// GET /api/subclass-choices/:source lists the option catalog for one generic
// subclass choice (e.g. "huntersPrey"), as GrantedAbility rows keyed by `source`
// = the SubclassChoice.catalogSource. Which choices a character can make and how
// many is carried by the serialized character's resources.subclassChoices; this
// route supplies the pickable options. Alphabetical.
subclassChoicesRouter.get("/:source", async (req, res) => {
  const { source } = req.params;
  const options = await prisma.grantedAbility.findMany({
    where: { source },
    orderBy: { name: "asc" },
  });

  res.json(
    options.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      minLevel: row.minLevel,
    })),
  );
});
