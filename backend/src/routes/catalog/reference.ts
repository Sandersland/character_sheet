import { Router } from "express";

import {
  ALIGNMENTS,
  MULTICLASS_PREREQUISITES,
  cantripsKnownAtLevel,
  multiclassPrerequisitesMet,
  preparedSpellCountAt,
  primaryAbilities,
  toolsByCategory,
} from "@/lib/srd/srd.js";
import { STARTING_EQUIPMENT } from "@/lib/inventory/starting-equipment.js";
import { prisma } from "@/lib/core/prisma.js";
import { subclassGateLevel } from "@/lib/leveling/effective-levels.js";
import { resolveEditionCatalog, withEditionOrShared } from "@/lib/rules/catalog-edition.js";
import { isRulesEdition } from "@/lib/rules/edition.js";
import type { RulesEdition } from "@character-sheet/shared-types";

export const referenceRouter = Router();

// Feeds the character-creation form's baseline lists: catalog rows for
// race/class/background plus the fixed alignment set and per-class starting-
// equipment definitions. Also ships the artisan-tool list for the sheet's
// Proficiencies-card dropdown (creation tool pickers derive from per-class
// toolChoices, not this list).
referenceRouter.get("/reference", async (req, res) => {
  const rawEdition = req.query.edition;
  if (rawEdition === undefined) {
    res.status(400).json({ error: "Missing required query parameter: edition" });
    return;
  }
  if (!isRulesEdition(rawEdition)) {
    res.status(400).json({ error: `Unknown edition: ${String(rawEdition)}` });
    return;
  }
  const edition: RulesEdition = rawEdition;

  // Sequential rather than Promise.all — see the matching comment in
  // charactersRouter's POST handler.
  const races = await prisma.race.findMany({ orderBy: { name: "asc" } });
  const rawClasses = await prisma.characterClass.findMany({
    orderBy: { name: "asc" },
    include: { subclasses: { orderBy: { name: "asc" } } },
  });
  const backgrounds = await prisma.background.findMany({
    orderBy: { name: "asc" },
    include: { originFeat: { select: { id: true, name: true, description: true, category: true } } },
  });

  // Resolved per-edition BY NAME, not by following the FK: Background.originFeatId
  // is whatever seed-time resolveOriginFeatId baked on (EDITION_2024), and a
  // NULL-edition Background row holding a hard FK to an edition-tagged Feat row
  // is the contradiction #1348 exists to remove. Resolving through
  // resolveEditionCatalog here makes this preview agree with what a character
  // actually gets — buildOriginEntry re-resolves the same way against the
  // CREATING character's edition, so the two can no longer disagree (they did:
  // a 2014 Criminal saw 2024 Alert text). The FK survives only as a name source
  // until #1348 replaces it with originFeatName.
  //
  // Scope latch (#1325 vs #1336): this endpoint resolves edition-dependent RULE
  // VALUES and this one feat text. WHICH catalog ROWS it returns (classes,
  // subclasses, backgrounds, spells) is still edition-unfiltered and is #1336's
  // job — no forked class/subclass/background rows are seeded today, so the lists
  // are identical for both editions and nothing is silently wrong yet.
  const originFeatNames = [
    ...new Set(backgrounds.map((b) => b.originFeat?.name).filter((n): n is string => n != null)),
  ];
  const originFeatRows = originFeatNames.length
    ? await prisma.feat.findMany({
        where: withEditionOrShared({ name: { in: originFeatNames } }, edition),
        select: { id: true, name: true, description: true, category: true, edition: true },
      })
    : [];
  const originFeatByName = new Map(
    resolveEditionCatalog(originFeatRows, edition, (f) => f.name).map((f) => [f.name, f]),
  );

  const classes = rawClasses.map((c) => ({
    id: c.id,
    name: c.name,
    hitDie: c.hitDie,
    savingThrows: c.savingThrows,
    skillChoiceCount: c.skillChoiceCount,
    skillChoices: c.skillChoices,
    isSpellcaster: c.isSpellcaster,
    // The caller's edition, never DEFAULT_RULES_EDITION: that names the edition a
    // NEW character defaults to, and coupling the two would let a change to the
    // creation default silently change what this catalog reports (#1325). Wire
    // field named after the rule function that produced it — never `subclassLevel`,
    // which is indistinguishable from the raw, edition-unresolved catalog column.
    subclassGateLevel: subclassGateLevel(c.subclassLevel, edition),
    // Tool proficiency fields — parallel to skillChoices/skillChoiceCount.
    toolProficiencies: c.toolProficiencies,
    toolChoices: c.toolChoices,
    toolChoiceCount: c.toolChoiceCount,
    subclasses: c.subclasses.map((s) => ({ id: s.id, name: s.name, description: s.description })),
    startingEquipment: STARTING_EQUIPMENT[c.name] ?? null,
    // #1161: PHB'24 primary ability/abilities; [] for a homebrew class.
    primaryAbility: primaryAbilities(c.name),
    // #1131: level-1 creation pick counts from the SRD 5.2 tables (null for a
    // non-caster) so the creation picker never re-encodes the rules.
    level1SpellPicks:
      preparedSpellCountAt(c.name, 1) != null
        ? { cantrips: cantripsKnownAtLevel(c.name, 1), spells: preparedSpellCountAt(c.name, 1)! }
        : null,
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
    // PHB'24 ability spread + Origin feat; empty/null for spec-less legacy rows (#1130).
    abilityChoices: b.abilityChoices,
    // Resolved for the requested edition — see the originFeatByName comment above.
    originFeat: b.originFeat ? (originFeatByName.get(b.originFeat.name) ?? null) : null,
  }));

  // Artisan tools for the sheet's Proficiencies-card dropdown (the only category consumed).
  const artisanTools = toolsByCategory("artisan");

  res.json({ races: racesWithTools, classes, backgrounds: backgroundsWithTools, alignments: ALIGNMENTS, artisanTools });
});
