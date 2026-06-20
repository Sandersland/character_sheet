import { Router } from "express";

import { ALIGNMENTS, STARTING_EQUIPMENT } from "../lib/srd.js";
import { prisma } from "../lib/prisma.js";

export const referenceRouter = Router();

// Feeds the character-creation form's baseline lists: catalog rows for
// race/class/background plus the fixed alignment set and per-class starting-
// equipment definitions. Alignments are a closed 9-value set served as a
// code constant. Starting-equipment definitions live in srd.ts (the only
// allowed home for 5e rules data) and are attached to each class row here so
// the frontend never has to duplicate them.
referenceRouter.get("/reference", async (_req, res) => {
  // Sequential rather than Promise.all — see the matching comment in
  // routes/characters.ts's POST handler.
  const races = await prisma.race.findMany({ orderBy: { name: "asc" } });
  const rawClasses = await prisma.characterClass.findMany({
    orderBy: { name: "asc" },
    include: { subclasses: { orderBy: { name: "asc" } } },
  });
  const backgrounds = await prisma.background.findMany({ orderBy: { name: "asc" } });

  const classes = rawClasses.map((c) => ({
    id: c.id,
    name: c.name,
    hitDie: c.hitDie,
    savingThrows: c.savingThrows,
    skillChoiceCount: c.skillChoiceCount,
    skillChoices: c.skillChoices,
    isSpellcaster: c.isSpellcaster,
    subclassLevel: c.subclassLevel,
    subclasses: c.subclasses.map((s) => ({ id: s.id, name: s.name, description: s.description })),
    startingEquipment: STARTING_EQUIPMENT[c.name] ?? null,
  }));

  res.json({ races, classes, backgrounds, alignments: ALIGNMENTS });
});
