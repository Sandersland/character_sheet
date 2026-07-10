import { Router } from "express";

import {
  ALIGNMENTS,
  MULTICLASS_PREREQUISITES,
  multiclassPrerequisitesMet,
  toolsByCategory,
} from "@/lib/srd/srd.js";
import { STARTING_EQUIPMENT } from "@/lib/starting-equipment.js";
import { prisma } from "@/lib/prisma.js";

export const referenceRouter = Router();

// Feeds the character-creation form's baseline lists: catalog rows for
// race/class/background plus the fixed alignment set and per-class starting-
// equipment definitions. Also ships the artisan-tool list for the sheet's
// Proficiencies-card dropdown (creation tool pickers derive from per-class
// toolChoices, not this list).
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
    // Tool proficiency fields — parallel to skillChoices/skillChoiceCount.
    toolProficiencies: c.toolProficiencies,
    toolChoices: c.toolChoices,
    toolChoiceCount: c.toolChoiceCount,
    subclasses: c.subclasses.map((s) => ({ id: s.id, name: s.name, description: s.description })),
    startingEquipment: STARTING_EQUIPMENT[c.name] ?? null,
    // 5e multiclass ability prerequisite (PHB p. 163): the option thresholds plus
    // a rendered description. Lets the add-class picker gate + explain eligibility
    // without duplicating the rules table on the frontend. Null for homebrew classes.
    multiclassPrerequisite: MULTICLASS_PREREQUISITES[c.name.toLowerCase()]
      ? {
          options: MULTICLASS_PREREQUISITES[c.name.toLowerCase()],
          description: multiclassPrerequisitesMet(c.name, {}).description,
        }
      : null,
  }));

  const racesWithTools = races.map((r) => ({
    id: r.id,
    name: r.name,
    speed: r.speed,
    toolProficiencies: r.toolProficiencies,
  }));

  const backgroundsWithTools = backgrounds.map((b) => ({
    id: b.id,
    name: b.name,
    skillProficiencies: b.skillProficiencies,
    toolProficiencies: b.toolProficiencies,
  }));

  // Artisan tools for the sheet's Proficiencies-card dropdown (the only category consumed).
  const artisanTools = toolsByCategory("artisan");

  res.json({ races: racesWithTools, classes, backgrounds: backgroundsWithTools, alignments: ALIGNMENTS, artisanTools });
});
