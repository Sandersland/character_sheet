import { Router } from "express";

import {
  ALIGNMENTS,
  ITEM_RARITIES,
  cantripsKnownAtLevel,
  conditionRulesText,
  maxSpellLevelForClass,
  multiclassPrerequisitesMet,
  preparedSpellCountAt,
  primaryAbilities,
  toolsByCategory,
  type MulticlassPrerequisiteOption,
} from "@/lib/srd/srd.js";
import { STARTING_EQUIPMENT } from "@/lib/inventory/starting-equipment.js";
import { prisma } from "@/lib/core/prisma.js";
import { subclassGateLevel } from "@/lib/leveling/effective-levels.js";
import { requireEditionOr400 } from "@/lib/http/parse-edition-param.js";
import { resolveEditionCatalog, withEditionOrShared } from "@/lib/rules/catalog-edition.js";

export const referenceRouter = Router();

// Feeds the character-creation form's baseline lists: catalog rows for
// race/class/background plus the fixed alignment set and per-class starting-
// equipment definitions. Also ships the artisan-tool list for the sheet's
// Proficiencies-card dropdown (creation tool pickers derive from per-class
// toolChoices, not this list).
referenceRouter.get("/reference", async (req, res) => {
  const edition = requireEditionOr400(req, res);
  if (edition === undefined) return;

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
  // Projected back to OriginFeatOption's four fields: `edition` is selected only
  // so resolveEditionCatalog can do the exact-then-shared resolution, and must
  // not reach the wire — the pre-#1325 include didn't select it, and a resolved
  // row is an implementation detail of the resolution, not part of the contract.
  const originFeatByName = new Map(
    resolveEditionCatalog(originFeatRows, edition, (f) => f.name).map((f) => [
      f.name,
      { id: f.id, name: f.name, description: f.description, category: f.category },
    ]),
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
    // #1161/#1529: PHB'24 primary ability/abilities, off the catalog column; [] for a homebrew class.
    primaryAbility: primaryAbilities(c.primaryAbilities),
    // #1131: level-1 creation pick counts from the SRD 5.2 tables (null for a
    // non-caster) so the creation picker never re-encodes the rules.
    //
    // maxSpellLevel (#1377) moves the highest-learnable-level rule off the client,
    // which hardcoded 1. Every seeded class that reaches this branch resolves to 1
    // today — the value is provenance, not yet a variable. Note it is NOT the same
    // call creationPickError makes: that one passes the chosen subclass, this one
    // can't (no subclass is chosen yet at this point in the ceremony). The two
    // agree at level 1; do not assume they are joined.
    level1SpellPicks:
      preparedSpellCountAt(c.name, 1) != null
        ? {
            cantrips: cantripsKnownAtLevel(c.name, 1),
            spells: preparedSpellCountAt(c.name, 1)!,
            maxSpellLevel: maxSpellLevelForClass(c.name, 1),
          }
        : null,
    // 5e multiclass ability prerequisite (PHB p. 163): the option thresholds plus
    // a rendered description. Lets the add-class picker gate + explain eligibility
    // without duplicating the rules table on the frontend. Null for homebrew classes.
    // `multiclassPrerequisites` (#1529): every seeded class has at least one
    // option group, so an empty array here means a homebrew/unseeded row.
    multiclassPrerequisite: ((): { options: MulticlassPrerequisiteOption[]; description: string } | null => {
      const options = c.multiclassPrerequisites as MulticlassPrerequisiteOption[];
      return options.length > 0
        ? { options, description: multiclassPrerequisitesMet(options, {}).description }
        : null;
    })(),
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

  // The 14 conditions' resolved {key,label,description} rows (#1322) — same
  // precedent as artisanTools above: a sheet-consumed list riding this
  // creation-named endpoint because it's catalog content (identical for every
  // character of an edition), not per-character derived state. Descriptions
  // are the requested edition's actual rules text, so no frontend module
  // needs to hold any of its own.
  const conditions = conditionRulesText(edition);

  // The universal turn actions (#1430), same precedent as conditions above: the
  // rows are catalog content identical for every character of an edition, so
  // they ride this endpoint rather than ~105 lines of static copy on every
  // character payload. Only `universal: true` rows are served — the
  // class-specific Action rows carry gates and effect dispatch and reach the
  // sheet through DERIVED_ACTIONS instead.
  const universalActionRows = await prisma.action.findMany({
    where: withEditionOrShared({ universal: true }, edition),
    select: { key: true, name: true, cost: true, description: true, edition: true },
  });
  // Sorted AFTER resolution, never as an `orderBy`: resolveEditionCatalog
  // preserves each group's FIRST-occurrence position, so a name-ordered
  // findMany would place the 2024 "Magic" row at "Cast a Spell"'s alphabetical
  // slot. `edition` is selected only so the resolution can run and must not
  // reach the wire — same rule as originFeatByName above. Alphabetical by name
  // is also SRD 5.2's own Actions-table order, so no `sortOrder` column.
  const universalActions = resolveEditionCatalog(universalActionRows, edition, (a) => a.key)
    .map(({ key, name, cost, description }) => ({ key, name, cost, description }))
    .sort((a, b) => a.name.localeCompare(b.name));

  res.json({
    races: racesWithTools,
    classes,
    backgrounds: backgroundsWithTools,
    alignments: ALIGNMENTS,
    artisanTools,
    conditions,
    universalActions,
    // The six magic-item rarity tiers (#1437). Unlike conditions above these are
    // edition-INVARIANT: ITEM_RARITIES takes no edition parameter, and spreading
    // the module const straight into the response — no intermediate const — is
    // what makes it provable at a glance that the requested edition cannot reach
    // it. The client holds the whole table rather than a resolved value per row
    // because the DM item form computes its value hint over UNSAVED form state,
    // with no server row to hang a resolved string on.
    itemRarities: ITEM_RARITIES,
  });
});
