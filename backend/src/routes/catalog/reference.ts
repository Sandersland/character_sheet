import { Router } from "express";

import {
  ALIGNMENTS,
  ITEM_RARITIES,
  conditionRulesText,
  level1SpellPicksFor,
  multiclassPrerequisitesMet,
  primaryAbilities,
  toolsByCategory,
  type MulticlassPrerequisiteOption,
} from "@/lib/srd/srd.js";
import {
  mapStartingEquipmentPackage,
  EQUIPMENT_PACKAGE_INCLUDE,
} from "@/lib/inventory/starting-equipment-package.js";
import { prisma } from "@/lib/core/prisma.js";
import { subclassGateLevel } from "@/lib/leveling/effective-levels.js";
import { requireEditionOr400 } from "@/lib/http/parse-edition-param.js";
import { resolveEditionCatalog, withEditionOrShared } from "@/lib/rules/catalog-edition.js";
import { backgroundGrantsAbilitySpread, backgroundGrantsOriginFeat } from "@/lib/rules/background-grants.js";
import type { AbilityIncreaseSpec } from "@/lib/srd/species-ability-increases.js";
import { isChooseCantrip, isChooseOriginFeat, isChooseSkills, type SpeciesTraitChoice } from "@/lib/srd/species-trait-choices.js";

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
  // #1679: species nested per edition, ALONGSIDE races above (the flat list
  // is untouched — pruned only in #1684). Exact-match `edition` filter, not
  // resolveEditionCatalog/withEditionOrShared: Species.edition is NOT NULL
  // (no species is edition-neutral), so there is no shared/NULL row to fall
  // back to — the same reasoning as StartingEquipmentPackage's own query above.
  // #1689: `traits` rides along so chooseSkills/chooseCantrip can be resolved
  // below — species.traits returns EVERY trait FK'd to this speciesId
  // regardless of variantId (plain Prisma relation semantics, same caveat
  // serialize/species.ts's activeTraitRows documents), hence `variantId`
  // selected here so speciesLevelChoice can filter to this species' OWN rows;
  // variant.traits is already scoped to that one variantId, no filter needed.
  const rawSpecies = await prisma.species.findMany({
    where: { edition },
    orderBy: { name: "asc" },
    include: {
      traits: { select: { variantId: true, choice: true } },
      variants: { orderBy: { name: "asc" }, include: { traits: { select: { choice: true } } } },
    },
  });
  // Narrowed to at-most-two-per-key at the DB (withEditionOrShared), then
  // resolveEditionCatalog picks the one row per business key — same D3 shape
  // as originFeatRows/universalActionRows below. `edition` is present on the
  // full row (no `select` strips it) purely to drive that resolution; the
  // projections below never forward it to the wire.
  const rawClasses = await prisma.characterClass.findMany({
    orderBy: { name: "asc" },
    include: { subclasses: { where: withEditionOrShared({}, edition), orderBy: { name: "asc" } } },
  });
  // One findMany for every class's package rather than one query per class
  // (avoids an N+1 over the `classes` map below). `edition` is non-nullable on
  // StartingEquipmentPackage — an exact-match filter, not resolveEditionCatalog
  // (there is no shared/NULL row to fall back to, unlike Feat/Subclass/Background).
  const startingEquipmentPackages = await prisma.startingEquipmentPackage.findMany({
    where: { classId: { in: rawClasses.map((c) => c.id) }, edition },
    include: EQUIPMENT_PACKAGE_INCLUDE,
  });
  // classId is non-null for every row here (filtered by `classId: { in }`
  // above) — the `!` narrows StartingEquipmentPackage.classId's schema type
  // (nullable since #1565's background reuse), never a runtime assumption.
  const startingEquipmentByClassId = new Map(
    startingEquipmentPackages.map((p) => [p.classId!, mapStartingEquipmentPackage(p)]),
  );

  const rawBackgrounds = await prisma.background.findMany({
    where: withEditionOrShared({}, edition),
    orderBy: { name: "asc" },
    include: { originFeat: { select: { id: true, name: true, description: true, category: true } } },
  });
  // keyOf is `name` (Background's business key, D2) — same as originFeatByName below.
  const backgrounds = resolveEditionCatalog(rawBackgrounds, edition, (b) => b.name);

  // One findMany for every background's package (#1565), same N+1-avoidance
  // reasoning as startingEquipmentPackages above. `edition` is non-nullable on
  // StartingEquipmentPackage — an exact-match filter, not resolveEditionCatalog
  // (no shared/NULL row to fall back to). Most backgrounds resolve to `null`
  // here: 2014 Charlatan/Criminal/Noble/Sage/Soldier get no package (SRD 5.1
  // ships only Acolyte, and PHB'14 equipment for the rest is unscoped) —
  // `null` is the correct, intentional answer for those rows, not a gap.
  const backgroundEquipmentPackages = await prisma.startingEquipmentPackage.findMany({
    where: { backgroundId: { in: backgrounds.map((b) => b.id) }, edition },
    include: EQUIPMENT_PACKAGE_INCLUDE,
  });
  const startingEquipmentByBackgroundId = new Map(
    backgroundEquipmentPackages.map((p) => [p.backgroundId!, mapStartingEquipmentPackage(p)]),
  );

  // Resolved per-edition BY NAME, not by following the FK: Background.originFeatId
  // is whatever seed-time resolveOriginFeatId baked on (EDITION_2024), and a
  // NULL-edition Background row holding a hard FK to an edition-tagged Feat row
  // is the contradiction #1348 exists to remove. Resolving through
  // resolveEditionCatalog here makes this preview agree with what a character
  // actually gets — buildOriginEntry re-resolves the same way against the
  // CREATING character's edition, so the two can no longer disagree (they did:
  // a 2014 Criminal saw 2024 Alert text; #1504 later found the correct 2014
  // answer isn't "the 2014 text" but "no Origin feat at all" — the name-lookup
  // below still runs so `originFeatByName` stays populated for 2024, but the
  // backgroundGrantsOriginFeat gate at the projection (below) is what actually
  // decides whether a 2014 background serves it). The FK survives only as a
  // name source until #1348 replaces it with originFeatName.
  //
  // Scope latch (#1336): backgrounds and each class's subclasses (below) are now
  // resolved per the requesting edition, same mechanism as originFeatRows and
  // universalActionRows. `startingEquipment` (above) is ALSO resolved per
  // requesting edition — by an exact (classId, edition) match rather than
  // resolveEditionCatalog's fallback, since StartingEquipmentPackage.edition is
  // non-nullable (#1534) — and, since #1535, that resolution reaches genuinely
  // different SRD 5.2 content, not a 2014 copy: a 2024 character gets the real
  // PHB'24 package. `races` stays deliberately unfiltered by this endpoint —
  // it's the legacy flat catalog, superseded per-edition by `species` (#1679,
  // exact match below, same reasoning as startingEquipment's) and pruned
  // outright in #1684, so filtering the flat list now would only be thrown
  // away work. `classes` themselves stay unfiltered too (one CharacterClass
  // row serves both editions by design, subclassGateLevel is the only field
  // that forks, #1308). The spell catalog (`GET /api/spells`) is a separate
  // endpoint with its own edition gap, #1517.
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
    // keyOf is `name` alone, not `${classId}::${name}` (D2): classId is
    // constant within one class's own subclasses array, so the compound key
    // resolveEditionCatalog's docstring prescribes for cross-class groups
    // would be harmless here but misleading.
    subclasses: resolveEditionCatalog(c.subclasses, edition, (s) => s.name).map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
    })),
    startingEquipment: startingEquipmentByClassId.get(c.id) ?? null,
    // #1161/#1529: PHB'24 primary ability/abilities, off the catalog column; [] for a homebrew class.
    primaryAbility: primaryAbilities(c.primaryAbilities),
    // #1131/#1510: level-1 creation pick counts (per requesting edition), the
    // SAME function creationSpellCountError enforces (D4) — served and
    // enforced can never disagree by construction. `null` for a non-caster (or
    // a 2014 Paladin/Ranger, which has no Spellcasting feature until level 2,
    // #1508's carried AC); `spells: 0` for a 2014 Cleric/Druid (no
    // creation-time list exists in SRD 5.1 — see level1SpellPicksFor's
    // comment). `subclass` is null here (not the chosen subclass
    // creationPickError's maxLevel call uses): no subclass is chosen yet at
    // this point in the ceremony — the two agree at level 1 regardless.
    level1SpellPicks: level1SpellPicksFor(c.name, null, edition),
    // 5e multiclass ability prerequisite (PHB'14 p. 163): the option thresholds plus
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

  // #1689: resolves chooseSkills/chooseCantrip off a row's own trait rows —
  // mirrors character-create.ts's fetchSpeciesChoiceSpecs (the SAME "first
  // match by discriminant" rule, kept in sync only by both reading through
  // isChooseSkills/isChooseCantrip, not a duplicated inline check).
  function traitChoices(traits: { choice: unknown }[]): SpeciesTraitChoice[] {
    return traits.map((t) => t.choice as SpeciesTraitChoice | null).filter((c): c is SpeciesTraitChoice => c != null);
  }
  function chooseSkillsOf(traits: { choice: unknown }[]) {
    return traitChoices(traits).find(isChooseSkills)?.chooseSkills ?? null;
  }
  function chooseCantripOf(traits: { choice: unknown }[]) {
    return traitChoices(traits).find(isChooseCantrip)?.chooseCantrip ?? null;
  }
  // #1690: a bare boolean (not object-or-null like the two above) — matches
  // chooseOriginFeatSchema's own `{chooseOriginFeat: true}` shape, which
  // carries no further spec to resolve.
  function chooseOriginFeatOf(traits: { choice: unknown }[]) {
    return traitChoices(traits).some(isChooseOriginFeat);
  }

  // #1679: variants nested inside each species, exactly like
  // classes[].subclasses above. abilityIncreases rides along as of #1681 (cast
  // through the AbilityIncreaseSpec[] shape — a wire mirror only, the frontend
  // ceremony never originates the rule, only renders this server-resolved
  // spec) so the creation ceremony can preview + request the choice; the raw
  // JSON column is [] for every EDITION_2024 row, matching resolveSpeciesGrants'
  // edition gate. speedOverride is NOT served yet — no client needs it before
  // the variant-speed picker lands (#1680/#1682). chooseSkills/chooseCantrip
  // (#1689) and chooseOriginFeat (#1690) ride the same way — null/false for
  // every row but the ones that carry the matching trait (Half-Elf's own
  // chooseSkills, High Elf's own chooseCantrip, 2024 Human's own chooseSkills
  // + chooseOriginFeat, 2024 Elf's own chooseSkills); see SpeciesOption's own
  // JSDoc (reference.ts, frontend) for why all three fields are served at
  // both levels.
  const speciesWithVariants = rawSpecies.map((s) => ({
    id: s.id,
    name: s.name,
    slug: s.slug,
    speed: s.speed,
    abilityIncreases: s.abilityIncreases as unknown as AbilityIncreaseSpec[],
    chooseSkills: chooseSkillsOf(s.traits.filter((t) => t.variantId === null)),
    chooseCantrip: chooseCantripOf(s.traits.filter((t) => t.variantId === null)),
    chooseOriginFeat: chooseOriginFeatOf(s.traits.filter((t) => t.variantId === null)),
    variants: s.variants.map((v) => ({
      id: v.id,
      name: v.name,
      slug: v.slug,
      abilityIncreases: v.abilityIncreases as unknown as AbilityIncreaseSpec[],
      chooseSkills: chooseSkillsOf(v.traits),
      chooseCantrip: chooseCantripOf(v.traits),
      chooseOriginFeat: chooseOriginFeatOf(v.traits),
    })),
  }));

  const backgroundsWithTools = backgrounds.map((b) => ({
    id: b.id,
    name: b.name,
    skillProficiencies: b.skillProficiencies,
    toolProficiencies: b.toolProficiencies,
    // PHB'24 ability spread; empty for a spec-less legacy row (#1130) AND for
    // every background under EDITION_2014 (#1572) — the spread is a PHB'24-only
    // mechanic, so this must agree with resolveBackgroundGrants's 2014 rejection.
    abilityChoices: backgroundGrantsAbilitySpread(edition) ? b.abilityChoices : [],
    // Resolved for the requested edition — see the originFeatByName comment
    // above. `null` for EVERY background under EDITION_2014 (#1504): Origin
    // feats are a PHB'24-only mechanic, so this must agree with
    // buildOriginEntry's 2014 no-grant, not just resolve to the 2014 catalog row.
    originFeat: backgroundGrantsOriginFeat(edition) && b.originFeat
      ? (originFeatByName.get(b.originFeat.name) ?? null)
      : null,
    // #1565: null for a background with no seeded package under this edition
    // (see startingEquipmentByBackgroundId's comment) — never a placeholder
    // empty-groups package, so the picker can tell "no equipment choices"
    // apart from "equipment choices, but this background chose none".
    startingEquipment: startingEquipmentByBackgroundId.get(b.id) ?? null,
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
    species: speciesWithVariants,
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
