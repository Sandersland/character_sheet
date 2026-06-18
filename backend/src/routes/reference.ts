import { Router } from "express";

import { ALIGNMENTS } from "../lib/srd.js";
import { prisma } from "../lib/prisma.js";

export const referenceRouter = Router();

// Feeds the character-creation form's baseline lists: catalog rows for
// race/class/background plus the fixed alignment set. Alignments are a
// closed 9-value set, served as a code constant rather than a table (same
// reasoning as the XP table in lib/experience.ts).
referenceRouter.get("/reference", async (_req, res) => {
  // Sequential rather than Promise.all — see the matching comment in
  // routes/characters.ts's POST handler.
  const races = await prisma.race.findMany({ orderBy: { name: "asc" } });
  const classes = await prisma.characterClass.findMany({ orderBy: { name: "asc" } });
  const backgrounds = await prisma.background.findMany({ orderBy: { name: "asc" } });

  res.json({ races, classes, backgrounds, alignments: ALIGNMENTS });
});
