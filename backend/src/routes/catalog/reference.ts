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
import { chooseCantripNeedsPlayerAbility, isChooseCantrip, isChooseOriginFeat, isChooseSkills, type SpeciesTraitChoice } from "@/lib/srd/species-trait-choices.js";

export const referenceRouter = Router();

// GET /api/reference: baseline catalog lists for character creation
// (race/class/background), plus alignments and the artisan-tool list for
// the sheet's Proficiencies-card dropdown.
referenceRouter.get("/reference", async (req, res) => {
  const edition = requireEditionOr400(req, res);
  if (edition === undefined) return;

  // Exact-match edition filter, not resolveEditionCatalog: Species.edition is NOT NULL, so there's no shared/NULL row to fall back to.
  // species.traits returns every trait FK'd to this species regardless of variantId; variantId is selected so it can be filtered to this species' own rows below.
  const rawSpecies = await prisma.species.findMany({
    where: { edition },
    orderBy: { name: "asc" },
    include: {
      traits: { select: { variantId: true, choice: true } },
      variants: {
        orderBy: { name: "asc" },
        include: {
          traits: { select: { choice: true } },
          grantedSpells: { select: { id: true } },
        },
      },
      // Species.grantedSpells is the unfiltered back-relation (every grant FK'd to this speciesId, spanning every variant); variantId is carried so the mapping below can narrow to species-level (variantId === null) only.
      grantedSpells: { select: { id: true, variantId: true } },
    },
  });
  // edition is present on the row only to drive resolveEditionCatalog's resolution; the projections below never forward it to the wire.
  const rawClasses = await prisma.characterClass.findMany({
    orderBy: { name: "asc" },
    include: { subclasses: { where: withEditionOrShared({}, edition), orderBy: { name: "asc" } } },
  });
  // edition is non-nullable on StartingEquipmentPackage — exact-match filter, not resolveEditionCatalog.
  const startingEquipmentPackages = await prisma.startingEquipmentPackage.findMany({
    where: { classId: { in: rawClasses.map((c) => c.id) }, edition },
    include: EQUIPMENT_PACKAGE_INCLUDE,
  });
  // classId is non-null here (filtered by classId: { in } above); the `!` narrows the nullable schema type, not a runtime assumption.
  const startingEquipmentByClassId = new Map(
    startingEquipmentPackages.map((p) => [p.classId!, mapStartingEquipmentPackage(p)]),
  );

  const rawBackgrounds = await prisma.background.findMany({
    where: withEditionOrShared({}, edition),
    orderBy: { name: "asc" },
    include: { originFeat: { select: { id: true, name: true, description: true, category: true } } },
  });
  const backgrounds = resolveEditionCatalog(rawBackgrounds, edition, (b) => b.name);

  // null here is intentional, not a gap — SRD 5.1 ships a seeded equipment package only for Acolyte.
  const backgroundEquipmentPackages = await prisma.startingEquipmentPackage.findMany({
    where: { backgroundId: { in: backgrounds.map((b) => b.id) }, edition },
    include: EQUIPMENT_PACKAGE_INCLUDE,
  });
  const startingEquipmentByBackgroundId = new Map(
    backgroundEquipmentPackages.map((p) => [p.backgroundId!, mapStartingEquipmentPackage(p)]),
  );

  // Resolved by name, not by following originFeatId: that FK is seed-baked to EDITION_2024 and doesn't follow the requesting edition. buildOriginEntry re-resolves this the same way — keep them in sync.
  const originFeatNames = [
    ...new Set(backgrounds.map((b) => b.originFeat?.name).filter((n): n is string => n != null)),
  ];
  const originFeatRows = originFeatNames.length
    ? await prisma.feat.findMany({
        where: withEditionOrShared({ name: { in: originFeatNames } }, edition),
        select: { id: true, name: true, description: true, category: true, edition: true },
      })
    : [];
  // edition is selected only to drive resolveEditionCatalog's resolution; it must not reach the wire.
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
    // The caller's edition, never DEFAULT_RULES_EDITION — that's the new-character default, a separate concern.
    subclassGateLevel: subclassGateLevel(c.subclassLevel, edition),
    toolProficiencies: c.toolProficiencies,
    toolChoices: c.toolChoices,
    toolChoiceCount: c.toolChoiceCount,
    // keyOf is just name, not classId::name — classId is constant within one class's subclasses, so the compound key would be harmless but misleading here.
    subclasses: resolveEditionCatalog(c.subclasses, edition, (s) => s.name).map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
    })),
    startingEquipment: startingEquipmentByClassId.get(c.id) ?? null,
    primaryAbility: primaryAbilities(c.primaryAbilities),
    // Same function creationSpellCountError enforces, so served and enforced counts can't disagree.
    level1SpellPicks: level1SpellPicksFor(c.name, null, edition),
    // PHB'14 p. 163 multiclass ability prerequisite; every seeded class has at least one option group, so an empty array here means a homebrew/unseeded row.
    multiclassPrerequisite: ((): { options: MulticlassPrerequisiteOption[]; description: string } | null => {
      const options = c.multiclassPrerequisites as MulticlassPrerequisiteOption[];
      return options.length > 0
        ? { options, description: multiclassPrerequisitesMet(options, {}).description }
        : null;
    })(),
  }));

  // Mirrors fetchSpeciesChoiceSpecs — kept in sync by both reading through isChooseSkills/isChooseCantrip, not a duplicated inline check.
  function traitChoices(traits: { choice: unknown }[]): SpeciesTraitChoice[] {
    return traits.map((t) => t.choice as SpeciesTraitChoice | null).filter((c): c is SpeciesTraitChoice => c != null);
  }
  function chooseSkillsOf(traits: { choice: unknown }[]) {
    return traitChoices(traits).find(isChooseSkills)?.chooseSkills ?? null;
  }
  function chooseCantripOf(traits: { choice: unknown }[]) {
    return traitChoices(traits).find(isChooseCantrip)?.chooseCantrip ?? null;
  }
  // Bare boolean (not object-or-null): matches chooseOriginFeatSchema's {chooseOriginFeat: true} shape, which carries no further spec.
  function chooseOriginFeatOf(traits: { choice: unknown }[]) {
    return traitChoices(traits).some(isChooseOriginFeat);
  }

  const speciesWithVariants = rawSpecies.map((s) => {
    const speciesTraits = s.traits.filter((t) => t.variantId === null);
    const speciesCantrip = chooseCantripOf(speciesTraits);
    return {
      id: s.id,
      name: s.name,
      slug: s.slug,
      speed: s.speed,
      abilityIncreases: s.abilityIncreases as unknown as AbilityIncreaseSpec[],
      // chooseCantripNeedsPlayerAbility is the same predicate resolveCastingAbility gates on, so the served flag can't drift from what's enforced.
      needsCastingAbility:
        s.grantedSpells.some((g) => g.variantId === null) || chooseCantripNeedsPlayerAbility(speciesCantrip),
      chooseSkills: chooseSkillsOf(speciesTraits),
      chooseCantrip: speciesCantrip,
      chooseOriginFeat: chooseOriginFeatOf(speciesTraits),
      variants: s.variants.map((v) => {
        const variantCantrip = chooseCantripOf(v.traits);
        return {
          id: v.id,
          name: v.name,
          slug: v.slug,
          abilityIncreases: v.abilityIncreases as unknown as AbilityIncreaseSpec[],
          // Merged the way fetchMergedAbilityIncreases does — never re-derive the rule here.
          abilityIncreasesReplace: v.abilityIncreasesReplace,
          // Already scoped to this variant by Prisma (its own back-relation).
          needsCastingAbility: v.grantedSpells.length > 0 || chooseCantripNeedsPlayerAbility(variantCantrip),
          chooseSkills: chooseSkillsOf(v.traits),
          chooseCantrip: variantCantrip,
          chooseOriginFeat: chooseOriginFeatOf(v.traits),
        };
      }),
    };
  });

  const backgroundsWithTools = backgrounds.map((b) => ({
    id: b.id,
    name: b.name,
    skillProficiencies: b.skillProficiencies,
    toolProficiencies: b.toolProficiencies,
    // Edition-invariant, unlike abilityChoices/originFeat below.
    toolChoices: b.toolChoices,
    toolChoiceCount: b.toolChoiceCount,
    // Empty under EDITION_2014 — the ability spread is a PHB'24-only mechanic; must agree with resolveBackgroundGrants's 2014 rejection.
    abilityChoices: backgroundGrantsAbilitySpread(edition) ? b.abilityChoices : [],
    // null under EDITION_2014 — Origin feats are PHB'24-only; must agree with buildOriginEntry's 2014 no-grant.
    originFeat: backgroundGrantsOriginFeat(edition) && b.originFeat
      ? (originFeatByName.get(b.originFeat.name) ?? null)
      : null,
    // null (not an empty-groups package) when there's no seeded package — lets the picker distinguish "no choices" from "chose none".
    startingEquipment: startingEquipmentByBackgroundId.get(b.id) ?? null,
  }));

  const artisanTools = toolsByCategory("artisan");

  // Catalog content identical for every character of the edition — not per-character derived state.
  const conditions = conditionRulesText(edition);

  // Only universal: true rows; class-specific Action rows reach the sheet through DERIVED_ACTIONS instead.
  const universalActionRows = await prisma.action.findMany({
    where: withEditionOrShared({ universal: true }, edition),
    select: { key: true, name: true, cost: true, description: true, edition: true },
  });
  // Sorted after resolution, not via orderBy: resolveEditionCatalog preserves first-occurrence order, and a name-ordered findMany would misplace the 2024 "Magic" row (SRD 5.2's Actions table is alphabetical).
  const universalActions = resolveEditionCatalog(universalActionRows, edition, (a) => a.key)
    .map(({ key, name, cost, description }) => ({ key, name, cost, description }))
    .sort((a, b) => a.name.localeCompare(b.name));

  res.json({
    species: speciesWithVariants,
    classes,
    backgrounds: backgroundsWithTools,
    alignments: ALIGNMENTS,
    artisanTools,
    conditions,
    universalActions,
    // Edition-invariant — ITEM_RARITIES takes no edition param. Served as the whole table since the DM item form computes its value hint over unsaved form state.
    itemRarities: ITEM_RARITIES,
  });
});
