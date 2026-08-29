import { prisma } from "@/lib/core/prisma.js";
import { ALIGNMENTS, isKnownTool, SKILLS } from "@/lib/srd/srd.js";
import { subclassGateLevel } from "@/lib/leveling/effective-levels.js";
import { DEFAULT_RULES_EDITION } from "@/lib/rules/edition.js";
import { crossEditionRejection, resolveEditionRow, withEditionOrShared } from "@/lib/rules/catalog-edition.js";
import {
  isChooseCantrip,
  isChooseOriginFeat,
  isChooseSkills,
  type ChooseSkills,
  type SpeciesTraitChoice,
} from "@/lib/srd/species-trait-choices.js";
import type { RulesEdition } from "@character-sheet/shared-types";
import type { CreateCharacterBody } from "@/lib/character/character-schemas.js";
import type {
  CreationToolProf,
  Fail,
  PhaseResult,
  PrimaryClassChoice,
  ResolvedBackground,
  ResolvedClass,
  ResolvedSelections,
  SpeciesChoiceSpecs,
  SpeciesSelection,
} from "./shared.js";

// The catalog column is 2014-only (#1308) — gate through subclassGateLevel(edition), never the raw column.
async function resolveSubclassName(
  characterClass: ResolvedClass,
  name: string,
  edition: RulesEdition,
): Promise<{ subclassId: string | null; subclassName: string }> {
  if (subclassGateLevel(characterClass.subclassLevel, edition) <= 1) {
    const candidates = await prisma.subclass.findMany({
      where: withEditionOrShared({ classId: characterClass.id, name }, edition),
      select: { id: true, name: true, edition: true },
    });
    const match = resolveEditionRow(candidates, edition);
    if (match) return { subclassId: match.id, subclassName: match.name };
  }
  return { subclassId: null, subclassName: name };
}

async function resolveSubclass(
  primaryClassChoice: PrimaryClassChoice,
  characterClass: ResolvedClass,
  edition: RulesEdition,
): Promise<PhaseResult<{ subclassId: string | null; subclassName: string | null }>> {
  if (primaryClassChoice.subclassId) {
    const subclass = await prisma.subclass.findUnique({
      where: { id: primaryClassChoice.subclassId },
    });
    if (!subclass) {
      return { ok: false, status: 400, error: `Unknown subclass id: ${primaryClassChoice.subclassId}` };
    }
    // Same edition-check-before-class-membership ordering as applySetSubclass (#1345).
    const mismatch = crossEditionRejection(subclass, `Subclass "${subclass.name}"`, edition);
    if (mismatch) return { ok: false, status: 400, error: mismatch };
    if (subclass.classId !== characterClass.id) {
      return {
        ok: false,
        status: 400,
        error: `Subclass "${subclass.name}" does not belong to ${characterClass.name}`,
      };
    }
    const gateLevel = subclassGateLevel(characterClass.subclassLevel, edition);
    if (gateLevel > 1) {
      return {
        ok: false,
        status: 400,
        error: `${characterClass.name} grants its subclass at level ${gateLevel}, not at creation (level 1)`,
      };
    }
    return { ok: true, subclassId: subclass.id, subclassName: subclass.name };
  }
  if (primaryClassChoice.subclass) {
    return { ok: true, ...(await resolveSubclassName(characterClass, primaryClassChoice.subclass, edition)) };
  }
  return { ok: true, subclassId: null, subclassName: null };
}

function validateVariantSelection(
  species: { name: string; variants: { id: string; name: string; speedOverride: number | null }[] },
  variantId: string | undefined,
): PhaseResult<{ variant: { id: string; name: string; speedOverride: number | null } | null }> {
  const hasVariants = species.variants.length > 0;
  if (hasVariants && !variantId) {
    return {
      ok: false,
      status: 400,
      error: `Species "${species.name}" requires a variantId (it has ${species.variants.length} variant option(s))`,
    };
  }
  if (!hasVariants && variantId) {
    return { ok: false, status: 400, error: `Species "${species.name}" has no variants — variantId must be omitted` };
  }
  if (!variantId) return { ok: true, variant: null };

  const variant = species.variants.find((v) => v.id === variantId);
  if (!variant) {
    return {
      ok: false,
      status: 400,
      error: `Variant id ${variantId} does not belong to species "${species.name}"`,
    };
  }
  return { ok: true, variant };
}

type SpeciesCatalogRow = {
  id: string;
  name: string;
  speed: number;
  variants: { id: string; name: string; speedOverride: number | null }[];
};

async function resolveSpeciesCatalogRow(
  speciesId: string,
  edition: RulesEdition,
): Promise<PhaseResult<{ species: SpeciesCatalogRow }>> {
  const species = await prisma.species.findUnique({
    where: { id: speciesId },
    include: { variants: { select: { id: true, name: true, speedOverride: true } } },
  });
  if (!species) {
    return { ok: false, status: 400, error: `Unknown species id: ${speciesId}` };
  }
  const mismatch = crossEditionRejection(species, `Species "${species.name}"`, edition);
  if (mismatch) return { ok: false, status: 400, error: mismatch };
  return { ok: true, species };
}

async function resolveSpeciesSelection(
  input: CreateCharacterBody,
  edition: RulesEdition,
): Promise<PhaseResult<SpeciesSelection>> {
  const catalogResult = await resolveSpeciesCatalogRow(input.speciesId, edition);
  if (!catalogResult.ok) return catalogResult;
  const { species } = catalogResult;

  const variantResult = validateVariantSelection(species, input.variantId);
  if (!variantResult.ok) return variantResult;
  const { variant } = variantResult;

  return {
    ok: true,
    speciesId: species.id,
    speciesName: species.name,
    variantId: variant?.id ?? null,
    variantName: variant?.name ?? null,
    speed: variant?.speedOverride ?? species.speed,
  };
}

async function fetchSpeciesChoiceSpecs(speciesId: string, variantId: string | null): Promise<SpeciesChoiceSpecs> {
  const traits = await prisma.speciesTrait.findMany({
    where: { speciesId, OR: [{ variantId: null }, ...(variantId ? [{ variantId }] : [])] },
    select: { choice: true },
  });
  const choices = traits
    .map((t) => t.choice)
    .filter((c): c is NonNullable<typeof c> => c != null) as unknown as SpeciesTraitChoice[];
  return {
    chooseSkills: choices.find(isChooseSkills)?.chooseSkills ?? null,
    chooseCantrip: choices.find(isChooseCantrip)?.chooseCantrip ?? null,
    chooseOriginFeat: choices.some(isChooseOriginFeat),
  };
}

function validateSpeciesSkillChoice(
  speciesSkills: string[] | undefined,
  spec: ChooseSkills | null,
  classBackgroundSkills: string[],
): Fail | { speciesSkills: string[] } {
  if (!spec) {
    if (speciesSkills) {
      return { ok: false, status: 400, error: "speciesSkills not allowed: this species has no skill choice" };
    }
    return { speciesSkills: [] };
  }
  if (!speciesSkills) {
    return { ok: false, status: 400, error: "speciesSkills required: this species grants a choice of skill proficiencies" };
  }
  const eligible = spec.from ?? SKILLS.map((s) => s.name);
  const invalid = speciesSkills.filter((s) => !eligible.includes(s));
  if (invalid.length > 0) {
    return { ok: false, status: 400, error: `speciesSkills: unknown or ineligible skill(s): ${invalid.join(", ")}` };
  }
  if (new Set(speciesSkills).size !== speciesSkills.length) {
    return { ok: false, status: 400, error: "speciesSkills must be distinct" };
  }
  if (speciesSkills.length !== spec.count) {
    return {
      ok: false,
      status: 400,
      error: `speciesSkills: choose exactly ${spec.count} distinct skill(s) (got ${speciesSkills.length})`,
    };
  }
  const duplicate = speciesSkills.filter((s) => classBackgroundSkills.includes(s));
  if (duplicate.length > 0) {
    return {
      ok: false,
      status: 400,
      error: `speciesSkills: ${duplicate.join(", ")} already chosen via class/background — species skills must be distinct from your other picks`,
    };
  }
  return { speciesSkills };
}

function validateSkillChoices(
  skillProficiencies: string[],
  characterClass: ResolvedClass,
  background: ResolvedBackground,
  speciesSkillSpec: ChooseSkills | null,
  requestedSpeciesSkills: string[] | undefined,
): Fail | { speciesSkills: string[] } {
  const allowedSkills = new Set([
    ...characterClass.skillChoices,
    ...(background?.skillProficiencies ?? []),
  ]);
  const invalidSkills = skillProficiencies.filter((skill) => !allowedSkills.has(skill));
  if (invalidSkills.length > 0) {
    return { ok: false, status: 400, error: `Invalid skill proficiencies: ${invalidSkills.join(", ")}` };
  }

  if (new Set(skillProficiencies).size !== skillProficiencies.length) {
    return { ok: false, status: 400, error: "Skill proficiencies must be distinct" };
  }

  const maxSkillChoices = characterClass.skillChoiceCount + (background?.skillProficiencies.length ?? 0);
  if (skillProficiencies.length > maxSkillChoices) {
    return {
      ok: false,
      status: 400,
      error: `Too many skill proficiencies selected (max ${maxSkillChoices})`,
    };
  }
  return validateSpeciesSkillChoice(requestedSpeciesSkills, speciesSkillSpec, skillProficiencies);
}

function validateToolChoicePicks(
  playerPicks: string[],
  pool: string[],
  cap: number,
  poolLabel: "class" | "background"
): Fail | null {
  if (playerPicks.length === 0) return null;

  const allowedPicks = new Set(pool);
  const invalidPicks = playerPicks.filter((t) => !allowedPicks.has(t));
  if (invalidPicks.length > 0) {
    return {
      ok: false,
      status: 400,
      error: `Invalid tool choices: ${invalidPicks.join(", ")}. Must be from the ${poolLabel}'s toolChoices list.`,
    };
  }
  if (!playerPicks.every((t) => isKnownTool(t))) {
    return { ok: false, status: 400, error: `Unknown tool name in ${poolLabel} toolChoices` };
  }
  if (new Set(playerPicks).size !== playerPicks.length) {
    return { ok: false, status: 400, error: `${poolLabel} tool choices must be distinct` };
  }
  if (playerPicks.length > cap) {
    return {
      ok: false,
      status: 400,
      error: `Too many ${poolLabel} tool choices (max ${cap})`,
    };
  }
  return null;
}

type ToolPicks = { playerToolChoices: string[]; playerBackgroundToolChoices: string[] };

function extractToolPicks(input: CreateCharacterBody): ToolPicks {
  return {
    playerToolChoices: input.toolChoices ?? [],
    playerBackgroundToolChoices: input.backgroundToolChoices ?? [],
  };
}

function validateToolPicks(
  picks: ToolPicks,
  characterClass: ResolvedClass,
  background: ResolvedBackground,
): Fail | null {
  const classError = validateToolChoicePicks(
    picks.playerToolChoices,
    characterClass.toolChoices,
    characterClass.toolChoiceCount,
    "class"
  );
  if (classError) return classError;
  return validateToolChoicePicks(
    picks.playerBackgroundToolChoices,
    background?.toolChoices ?? [],
    background?.toolChoiceCount ?? 0,
    "background"
  );
}

function assembleCreationToolProfs(
  characterClass: ResolvedClass,
  background: ResolvedBackground,
  picks: ToolPicks,
): CreationToolProf[] {
  return [
    ...(background?.toolProficiencies ?? []).map((name) => ({ name, source: "background" as const })),
    ...(characterClass.toolProficiencies ?? []).map((name) => ({ name, source: "class" as const })),
    ...picks.playerToolChoices.map((name) => ({ name, source: "class" as const })),
    ...picks.playerBackgroundToolChoices.map((name) => ({ name, source: "background" as const })),
  ];
}

function resolveToolProficiencies(
  input: CreateCharacterBody,
  characterClass: ResolvedClass,
  background: ResolvedBackground,
): PhaseResult<{ creationToolProfs: CreationToolProf[] }> {
  const picks = extractToolPicks(input);
  const toolError = validateToolPicks(picks, characterClass, background);
  if (toolError) return toolError;
  return { ok: true, creationToolProfs: assembleCreationToolProfs(characterClass, background, picks) };
}

function resolveProficiencies(
  input: CreateCharacterBody,
  characterClass: ResolvedClass,
  background: ResolvedBackground,
  speciesSkillSpec: ChooseSkills | null,
): PhaseResult<{ skillProficiencies: string[]; creationToolProfs: CreationToolProf[] }> {
  const skillProficiencies = input.skillProficiencies ?? [];
  const skillResult = validateSkillChoices(skillProficiencies, characterClass, background, speciesSkillSpec, input.speciesSkills);
  if ("ok" in skillResult) return skillResult;

  const toolResult = resolveToolProficiencies(input, characterClass, background);
  if (!toolResult.ok) return toolResult;

  return {
    ok: true,
    skillProficiencies: [...skillProficiencies, ...skillResult.speciesSkills],
    creationToolProfs: toolResult.creationToolProfs,
  };
}

function validateCreationBasics(
  input: CreateCharacterBody,
): PhaseResult<{ primaryClassChoice: PrimaryClassChoice }> {
  if (!ALIGNMENTS.includes(input.alignment)) {
    return { ok: false, status: 400, error: `Unknown alignment: ${input.alignment}` };
  }
  if (!input.classes.length) {
    return { ok: false, status: 400, error: "At least one class is required" };
  }
  return { ok: true, primaryClassChoice: input.classes[0] };
}

async function resolveCharacterClass(
  primaryClassChoice: PrimaryClassChoice,
): Promise<PhaseResult<{ characterClass: ResolvedClass }>> {
  const characterClass = await prisma.characterClass.findUnique({
    where: { name: primaryClassChoice.name },
  });
  if (!characterClass) {
    return { ok: false, status: 400, error: `Unknown class: ${primaryClassChoice.name}` };
  }
  return { ok: true, characterClass };
}

export async function resolveSelections(
  input: CreateCharacterBody
): Promise<PhaseResult<ResolvedSelections>> {
  const basics = validateCreationBasics(input);
  if (!basics.ok) return basics;
  const { primaryClassChoice } = basics;

  // Must resolve before the background lookup below, which needs it to pick the right edition-tagged row (#1306).
  const edition: RulesEdition = input.rulesEdition ?? DEFAULT_RULES_EDITION;

  // Sequential, not Promise.all: the pg driver's pool can warn/queue on concurrent queries from one PrismaClient; these are cheap point-lookups.
  const classResult = await resolveCharacterClass(primaryClassChoice);
  if (!classResult.ok) return classResult;
  const { characterClass } = classResult;

  const backgroundCandidates = await prisma.background.findMany({
    where: withEditionOrShared({ name: input.background }, edition),
    include: { originFeat: true },
  });
  const background = resolveEditionRow(backgroundCandidates, edition) ?? null;

  const subclass = await resolveSubclass(primaryClassChoice, characterClass, edition);
  if (!subclass.ok) return subclass;

  const speciesSelection = await resolveSpeciesSelection(input, edition);
  if (!speciesSelection.ok) return speciesSelection;

  const speciesChoiceSpecs = await fetchSpeciesChoiceSpecs(speciesSelection.speciesId, speciesSelection.variantId);

  const proficiencies = resolveProficiencies(input, characterClass, background, speciesChoiceSpecs.chooseSkills);
  if (!proficiencies.ok) return proficiencies;

  return {
    ok: true,
    primaryClassChoice,
    characterClass,
    background,
    subclassId: subclass.subclassId,
    subclassName: subclass.subclassName,
    skillProficiencies: proficiencies.skillProficiencies,
    creationToolProfs: proficiencies.creationToolProfs,
    edition,
    speciesSelection: {
      speciesId: speciesSelection.speciesId,
      speciesName: speciesSelection.speciesName,
      variantId: speciesSelection.variantId,
      variantName: speciesSelection.variantName,
      speed: speciesSelection.speed,
    },
    speciesChoiceSpecs,
  };
}
