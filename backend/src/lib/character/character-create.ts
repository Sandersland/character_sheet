import { randomUUID } from "node:crypto";

import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import {
  autoEquipSlot,
  buildInventoryCreateFromCatalog,
  catalogItemDetailInclude,
  selectAutoEquip,
  stripInventoryCreateForWrite,
} from "@/lib/inventory/inventory.js";
import {
  ALIGNMENTS,
  deriveCreatedCharacter,
  derivePreparedSpellLimit,
  isKnownTool,
  level1SpellPicksFor,
  maxSpellLevelForClass,
  SKILLS,
} from "@/lib/srd/srd.js";
import { ABILITY_CAP } from "@/lib/leveling/advancement.js";
import {
  normalizeResourcesMutable,
  serializeResourcesState,
  type AdvancementEntry,
  type FeatImprovement,
} from "@/lib/classes/resources.js";
import {
  mapStartingEquipmentPackage,
  EQUIPMENT_PACKAGE_INCLUDE,
} from "@/lib/inventory/starting-equipment-package.js";
import { creationSpellEntry } from "@/lib/spellcasting/spellcasting.js";
import { clampPreparedToLimit, type SpellEntry } from "@/lib/spellcasting/spell-state.js";
import { classesOf, rejectCrossEditionSpellForks, SPELL_CLASS_MEMBERSHIP_SELECT } from "@/lib/spellcasting/spell-classes.js";
import { loadSubclassSpellListExpansionIds } from "@/lib/spellcasting/spell-list-expansion.js";
import { subclassGateLevel } from "@/lib/leveling/effective-levels.js";
import { DEFAULT_RULES_EDITION } from "@/lib/rules/edition.js";
import { crossEditionRejection, resolveEditionRow, withEditionOrShared } from "@/lib/rules/catalog-edition.js";
import {
  applyAbilitySpread,
  backgroundGrantsAbilitySpread,
  backgroundGrantsOriginFeat,
  floatingSpreadShapeValid,
  speciesGrantsAbilityIncreases,
} from "@/lib/rules/background-grants.js";
import {
  ABILITY_NAMES,
  type AbilityIncreaseSpec,
  type ChooseIncrease,
} from "@/lib/srd/species-ability-increases.js";
import {
  chooseCantripNeedsPlayerAbility,
  isChooseCantrip,
  isChooseOriginFeat,
  isChooseSkills,
  type ChooseCantrip,
  type ChooseSkills,
  type SpeciesTraitChoice,
} from "@/lib/srd/species-trait-choices.js";
import type { ClassStartingEquipment, RulesEdition } from "@character-sheet/shared-types";
import type { CreateCharacterBody } from "./character-schemas.js";

export type CreateCharacterResult =
  | { ok: true; id: string }
  | { ok: false; status: 400; error: string };

type Fail = { ok: false; status: 400; error: string };
type Ok<T> = { ok: true } & T;
type PhaseResult<T> = Fail | Ok<T>;

type PrimaryClassChoice = CreateCharacterBody["classes"][number];
type ResolvedClass = NonNullable<Awaited<ReturnType<typeof prisma.characterClass.findUnique>>>;
type ResolvedBackground = Prisma.BackgroundGetPayload<{ include: { originFeat: true } }> | null;

type BackgroundGrants = {
  effectiveScores: Record<string, number>;
  originEntry: AdvancementEntry | null;
};

const MAGIC_INITIATE_CLASS_BY_BACKGROUND: Record<string, string> = {
  Acolyte: "Cleric",
  Sage: "Wizard",
};
type CreationToolProf = { name: string; source: "background" | "class" };
type PackageEquipment = Extract<
  NonNullable<CreateCharacterBody["startingEquipment"]>,
  { mode: "package" }
>;
type ClassEquipmentDef = ClassStartingEquipment;
type InventoryCreate = ReturnType<typeof buildInventoryCreateFromCatalog>;

type ResolvedSelections = {
  primaryClassChoice: PrimaryClassChoice;
  characterClass: ResolvedClass;
  background: ResolvedBackground;
  subclassId: string | null;
  subclassName: string | null;
  skillProficiencies: string[];
  creationToolProfs: CreationToolProf[];
  edition: RulesEdition;
  speciesSelection: SpeciesSelection;
  speciesChoiceSpecs: SpeciesChoiceSpecs;
};

type SpeciesSelection = {
  speciesId: string;
  speciesName: string;
  variantId: string | null;
  variantName: string | null;
  // Variant speedOverride wins over the species' own speed.
  speed: number;
};

type MaterializedEquipment = {
  inventoryItemCreates: InventoryCreate[];
  startingCurrency?: { cp: number; sp: number; gp: number; pp: number };
};

async function resolveFixedItems(
  refs: { catalogName: string; quantity?: number }[]
): Promise<{ inventoryCreates: InventoryCreate[]; error?: string }> {
  const refNames = [...new Set(refs.map((r) => r.catalogName))];
  const packs = await prisma.pack.findMany({
    where: { name: { in: refNames } },
    include: { contents: { include: { item: { select: { name: true } } } } },
  });
  const packByName = new Map(packs.map((p) => [p.name, p]));

  const expanded: { catalogName: string; quantity: number }[] = [];
  for (const ref of refs) {
    const pack = packByName.get(ref.catalogName);
    if (pack) {
      for (const content of pack.contents) {
        expanded.push({ catalogName: content.item.name, quantity: content.quantity * (ref.quantity ?? 1) });
      }
    } else {
      expanded.push({ catalogName: ref.catalogName, quantity: ref.quantity ?? 1 });
    }
  }

  const names = [...new Set(expanded.map((r) => r.catalogName))];
  const items = await prisma.item.findMany({
    // Pinned to the GLOBAL catalog (#1645) — an unpinned read could let a campaign row shadow the catalog item.
    where: { scopeKey: "global", name: { in: names } },
    include: catalogItemDetailInclude,
  });
  const itemByName = new Map(items.map((i) => [i.name, i]));

  const missing = names.filter((n) => !itemByName.has(n));
  if (missing.length > 0) {
    return { inventoryCreates: [], error: `Unknown catalog items: ${missing.join(", ")}` };
  }

  const inventoryCreates = expanded.map((ref, idx) =>
    buildInventoryCreateFromCatalog(itemByName.get(ref.catalogName)!, { quantity: ref.quantity, position: idx })
  );
  return { inventoryCreates };
}

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

async function speciesGrantsSpells(speciesId: string, variantId: string | null): Promise<boolean> {
  const count = await prisma.speciesGrantedSpell.count({
    where: { speciesId, OR: variantId ? [{ variantId: null }, { variantId }] : [{ variantId: null }] },
  });
  return count > 0;
}

async function resolveCastingAbility(
  input: CreateCharacterBody,
  speciesSelection: SpeciesSelection,
  chooseCantrip: ChooseCantrip | null,
): Promise<PhaseResult<{ castingAbility: string | null }>> {
  const submitted = input.castingAbility;
  const grantsSpells = await speciesGrantsSpells(speciesSelection.speciesId, speciesSelection.variantId);
  const needsAbility = grantsSpells || chooseCantripNeedsPlayerAbility(chooseCantrip);
  if (!needsAbility) {
    if (submitted) {
      const error = chooseCantrip
        ? "castingAbility not allowed: this species/variant's spellcasting ability is fixed"
        : "castingAbility not allowed: this species/variant grants no spells";
      return { ok: false, status: 400, error };
    }
    return { ok: true, castingAbility: null };
  }
  if (!submitted) {
    return { ok: false, status: 400, error: "castingAbility required: this species/variant grants spells with a chosen casting ability" };
  }
  return { ok: true, castingAbility: submitted };
}

type SpeciesChoiceSpecs = {
  chooseSkills: ChooseSkills | null;
  chooseCantrip: ChooseCantrip | null;
  chooseOriginFeat: boolean;
};

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

async function resolveSelections(
  input: CreateCharacterBody
): Promise<PhaseResult<ResolvedSelections>> {
  const basics = validateCreationBasics(input);
  if (!basics.ok) return basics;
  const { primaryClassChoice } = basics;

  // Sequential, not Promise.all: the pg driver's pool can warn/queue on concurrent queries from one PrismaClient; these are cheap point-lookups.
  // Write-once (#1285): DEFAULT_RULES_EDITION is the shared constant keeping this default and the create() call's rulesEdition from drifting apart.
  // Must resolve before the background lookup below, which needs it to pick the right edition-tagged row (#1306).
  const edition: RulesEdition = input.rulesEdition ?? DEFAULT_RULES_EDITION;

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

function abilityCapOverflowError(
  entries: [string, number][],
  base: Record<string, number>,
  fieldName: string,
): Fail | null {
  const over = entries.find(([ability, amount]) => (base[ability] ?? 10) + amount > ABILITY_CAP);
  if (!over) return null;
  return { ok: false, status: 400, error: `${fieldName}: ${over[0]} would exceed ${ABILITY_CAP}` };
}

// Ability scores are capped at 20 (SRD 5.2).
// floatingSpreadShapeValid is the SAME shared shape check validateSpeciesFloating uses below — not a copy.
function validateBackgroundSpread(
  spread: Record<string, number>,
  choices: string[],
  base: Record<string, number>,
): Fail | null {
  const entries = Object.entries(spread);
  const invalid = entries.filter(([ability]) => !choices.includes(ability)).map(([a]) => a);
  if (invalid.length > 0) {
    return { ok: false, status: 400, error: `backgroundAbilities: ${invalid.join(", ")} not in this background's choices (${choices.join(", ")})` };
  }
  if (!floatingSpreadShapeValid(entries.map(([, amount]) => amount))) {
    return { ok: false, status: 400, error: "backgroundAbilities must be +2/+1 (two abilities) or +1/+1/+1 (three abilities)" };
  }
  return abilityCapOverflowError(entries, base, "backgroundAbilities");
}

// Origin feats are a PHB'24-only mechanic (#1504).
// Re-resolves the feat by NAME against this character's edition rather than trusting the seed-baked FK, with no fallback on a miss — grant nothing rather than risk snapshotting the wrong edition's mechanics.
async function buildOriginEntry(background: ResolvedBackground, edition: RulesEdition): Promise<AdvancementEntry | null> {
  if (!backgroundGrantsOriginFeat(edition)) return null;
  if (!background?.originFeat) return null;
  const baked = background.originFeat;
  const candidates = await prisma.feat.findMany({ where: withEditionOrShared({ name: baked.name }, edition) });
  const feat = resolveEditionRow(candidates, edition);
  if (!feat) return null;
  const flavor = feat.name === "Magic Initiate" ? MAGIC_INITIATE_CLASS_BY_BACKGROUND[background.name] : undefined;
  const featDescription = flavor ? `${feat.description}\n\nBackground grant: ${flavor} spell list.` : feat.description;
  return {
    id: randomUUID(),
    level: 1,
    kind: "feat",
    origin: true,
    abilityDeltas: {},
    hpDelta: 0,
    initDelta: 0,
    featId: feat.id,
    featName: feat.name,
    featDescription,
    improvements: (feat.improvements as unknown as FeatImprovement[]) ?? [],
  };
}

// The background ability spread is a PHB'24-only mechanic (#1572).
async function resolveBackgroundGrants(
  input: CreateCharacterBody,
  background: ResolvedBackground,
  edition: RulesEdition,
): Promise<PhaseResult<BackgroundGrants>> {
  const spread = input.backgroundAbilities;
  const choices = background?.abilityChoices ?? [];

  if (spread) {
    if (!backgroundGrantsAbilitySpread(edition)) {
      return { ok: false, status: 400, error: "backgroundAbilities not allowed: background ability scores are a 2024 rule" };
    }
    if (choices.length === 0) {
      return { ok: false, status: 400, error: "backgroundAbilities not allowed: this background has no ability spread" };
    }
    const shapeError = validateBackgroundSpread(spread, choices, input.abilityScores);
    if (shapeError) return shapeError;
  }

  return {
    ok: true,
    effectiveScores: applyAbilitySpread(input.abilityScores, spread),
    originEntry: await buildOriginEntry(background, edition),
  };
}

type SpeciesGrants = {
  effectiveScores: Record<string, number>;
  appliedIncreases: { ability: string; amount: number }[];
};

function splitAbilityIncreaseSpecs(specs: AbilityIncreaseSpec[]): {
  fixedSpread: Record<string, number>;
  chooseSpecs: ChooseIncrease[];
  floatingSpecs: number[];
} {
  const fixedSpread: Record<string, number> = {};
  const chooseSpecs: ChooseIncrease[] = [];
  const floatingSpecs: number[] = [];
  for (const spec of specs) {
    if ("ability" in spec) {
      fixedSpread[spec.ability] = (fixedSpread[spec.ability] ?? 0) + spec.amount;
    } else if ("choose" in spec) {
      chooseSpecs.push(spec.choose);
    } else {
      floatingSpecs.push(spec.floating);
    }
  }
  return { fixedSpread, chooseSpecs, floatingSpecs };
}

function validateSpeciesChoose(
  spec: ChooseIncrease,
  submitted: Record<string, number>,
  fixedAbilities: Set<string>,
  base: Record<string, number>,
): Fail | { chosen: Record<string, number> } {
  const eligible: string[] = spec.from ?? [...ABILITY_NAMES];
  const entries = Object.entries(submitted);

  const invalid = entries.filter(([ability]) => !eligible.includes(ability) || fixedAbilities.has(ability));
  if (invalid.length > 0) {
    const options = eligible.filter((ability) => !fixedAbilities.has(ability));
    return {
      ok: false,
      status: 400,
      error: `speciesAbilities: ${invalid.map(([a]) => a).join(", ")} not eligible (options: ${options.join(", ")})`,
    };
  }
  const wrongAmount = entries.find(([, amount]) => amount !== spec.amount);
  if (wrongAmount) {
    return { ok: false, status: 400, error: `speciesAbilities: each choice must be +${spec.amount}` };
  }
  if (entries.length !== spec.count) {
    return {
      ok: false,
      status: 400,
      error: `speciesAbilities: choose exactly ${spec.count} distinct abilities (got ${entries.length})`,
    };
  }
  return abilityCapOverflowError(entries, base, "speciesAbilities") ?? { chosen: Object.fromEntries(entries) };
}

// Validates via the SAME floatingSpreadShapeValid function validateBackgroundSpread uses above — not a second copy.
function validateSpeciesFloating(
  submitted: Record<string, number>,
  fixedAbilities: Set<string>,
  base: Record<string, number>,
): Fail | { chosen: Record<string, number> } {
  const entries = Object.entries(submitted);
  const invalid = entries.filter(([ability]) => fixedAbilities.has(ability));
  if (invalid.length > 0) {
    return {
      ok: false,
      status: 400,
      error: `speciesAbilities: ${invalid.map(([a]) => a).join(", ")} already fixed by this species`,
    };
  }
  if (!floatingSpreadShapeValid(entries.map(([, amount]) => amount))) {
    return { ok: false, status: 400, error: "speciesAbilities must be +2/+1 (two abilities) or +1/+1/+1 (three abilities)" };
  }
  return abilityCapOverflowError(entries, base, "speciesAbilities") ?? { chosen: Object.fromEntries(entries) };
}

function resolveChosenIncreases(
  chooseSpecs: ChooseIncrease[],
  floatingSpecs: number[],
  submitted: Record<string, number> | undefined,
  fixedAbilities: Set<string>,
  base: Record<string, number>,
): Fail | { chosen: Record<string, number> } {
  const needsChoice = chooseSpecs.length > 0 || floatingSpecs.length > 0;
  if (!needsChoice) {
    if (submitted) {
      return { ok: false, status: 400, error: "speciesAbilities not allowed: this species has no ability choice" };
    }
    return { chosen: {} };
  }
  if (!submitted) {
    return { ok: false, status: 400, error: "speciesAbilities required: this species grants a choice of ability increases" };
  }
  if (chooseSpecs.length > 0) {
    return validateSpeciesChoose(chooseSpecs[0], submitted, fixedAbilities, base);
  }
  return validateSpeciesFloating(submitted, fixedAbilities, base);
}

function speciesAbilitiesEditionGuard(
  submitted: Record<string, number> | undefined,
  edition: RulesEdition,
): Fail | null {
  if (submitted && !speciesGrantsAbilityIncreases(edition)) {
    return { ok: false, status: 400, error: "speciesAbilities not allowed: species ability increases are a 2014 rule" };
  }
  return null;
}

// The one place species.abilityIncreases is read — resolveSpeciesCatalogRow (above) deliberately avoids this column for every candidate variant.
async function fetchMergedAbilityIncreases(
  speciesId: string,
  variantId: string | null,
): Promise<AbilityIncreaseSpec[]> {
  const species = await prisma.species.findUniqueOrThrow({
    where: { id: speciesId },
    select: { abilityIncreases: true },
  });
  const variant = variantId
    ? await prisma.speciesVariant.findUniqueOrThrow({
        where: { id: variantId },
        select: { abilityIncreases: true, abilityIncreasesReplace: true },
      })
    : null;
  const variantIncreases = (variant?.abilityIncreases as unknown as AbilityIncreaseSpec[]) ?? [];
  // abilityIncreasesReplace (Astral Elf, #1751): a replacing variant supplies the ENTIRE ability increase spec.
  // The base species' increases are dropped, not stacked — every real subrace leaves this flag false and stacks additively.
  if (variant?.abilityIncreasesReplace) return variantIncreases;
  return [...(species.abilityIncreases as unknown as AbilityIncreaseSpec[]), ...variantIncreases];
}

// Ability increases are a PHB'14-only mechanic (#1572's mirror image).
// No LEVEL_GATED_RECONCILERS entry applies — this state's legal max never changes with level, only at creation.
async function resolveSpeciesGrants(
  input: CreateCharacterBody,
  speciesSelection: SpeciesSelection,
  edition: RulesEdition,
  baseScores: Record<string, number>,
): Promise<PhaseResult<SpeciesGrants>> {
  const submitted = input.speciesAbilities;

  const editionError = speciesAbilitiesEditionGuard(submitted, edition);
  if (editionError) return editionError;
  if (!speciesGrantsAbilityIncreases(edition)) {
    return { ok: true, effectiveScores: baseScores, appliedIncreases: [] };
  }

  const specs = await fetchMergedAbilityIncreases(speciesSelection.speciesId, speciesSelection.variantId);
  const { fixedSpread, chooseSpecs, floatingSpecs } = splitAbilityIncreaseSpecs(specs);

  // Fixed increases are server-applied, so a cap-overflow error names the field "species" (not speciesAbilities), since the client never sent that field.
  const fixedCapError = abilityCapOverflowError(Object.entries(fixedSpread), baseScores, "species");
  if (fixedCapError) return fixedCapError;

  const chosenResult = resolveChosenIncreases(chooseSpecs, floatingSpecs, submitted, new Set(Object.keys(fixedSpread)), baseScores);
  if ("ok" in chosenResult) return chosenResult;

  const fullSpread = { ...fixedSpread, ...chosenResult.chosen };
  return {
    ok: true,
    effectiveScores: applyAbilitySpread(baseScores, fullSpread),
    appliedIncreases: Object.entries(fullSpread).map(([ability, amount]) => ({ ability, amount })),
  };
}

function resolveStartingGold(
  gold: number,
  className: string,
  classDef: ClassEquipmentDef | null,
): PhaseResult<{ startingCurrency: { cp: number; sp: number; gp: number; pp: number } }> {
  if (classDef) {
    if (!classDef.gold) {
      return {
        ok: false,
        status: 400,
        error: `${className} has no roll-for-gold alternative under this ruleset — choose a starting-equipment package option instead`,
      };
    }
    const { diceCount, diceFaces, multiplier } = classDef.gold;
    const min = diceCount * multiplier;
    const max = diceCount * diceFaces * multiplier;
    if (gold < min || gold > max) {
      return {
        ok: false,
        status: 400,
        error: `Starting gold must be between ${min} and ${max} for ${className}`,
      };
    }
  }
  return { ok: true, startingCurrency: { cp: 0, sp: 0, gp: gold, pp: 0 } };
}

type EquipmentGroup = ClassEquipmentDef["groups"][number];
type EquipmentBundle = EquipmentGroup["options"][number];
type PackageSelection = PackageEquipment["selections"][number];
type OpenPick = NonNullable<EquipmentBundle["openPicks"]>[number];
type FixedRef = { catalogName: string; quantity: number };

function bundleFixedRefs(bundle: EquipmentBundle): FixedRef[] {
  return (bundle.items ?? []).map((ref) => ({ catalogName: ref.catalogName, quantity: ref.quantity ?? 1 }));
}

type OpenPickCatalogItem = {
  name: string;
  category: string;
  toolCategory: string | null;
  weaponDetail?: { weaponClass: string | null; weaponRange: string | null } | null;
};

function toolCategoryFilterError(catalogItem: OpenPickCatalogItem, pick: OpenPick, chosenName: string): Fail | null {
  if (!pick.filter.toolCategory || catalogItem.toolCategory === pick.filter.toolCategory) return null;
  return {
    ok: false,
    status: 400,
    error: `Open pick "${chosenName}" does not satisfy filter: toolCategory must be "${pick.filter.toolCategory}"`,
  };
}

function boundToolChoiceError(chosenName: string, creationToolProfs: CreationToolProf[]): Fail | null {
  const isChosenToolProf = creationToolProfs.some((p) => p.name === chosenName);
  if (isChosenToolProf) return null;
  return {
    ok: false,
    status: 400,
    error: `Open pick "${chosenName}" is not one of this character's chosen tool proficiencies`,
  };
}

function weaponFilterError(catalogItem: OpenPickCatalogItem, pick: OpenPick, chosenName: string): Fail | null {
  if (catalogItem.category !== "weapon") {
    return { ok: false, status: 400, error: `Open pick "${chosenName}" is not a known weapon in the catalog` };
  }
  if (pick.filter.weaponClass && catalogItem.weaponDetail?.weaponClass !== pick.filter.weaponClass) {
    return {
      ok: false,
      status: 400,
      error: `Open pick "${chosenName}" does not satisfy filter: weaponClass must be "${pick.filter.weaponClass}"`,
    };
  }
  if (pick.filter.range && catalogItem.weaponDetail?.weaponRange !== pick.filter.range) {
    return {
      ok: false,
      status: 400,
      error: `Open pick "${chosenName}" does not satisfy filter: range must be "${pick.filter.range}"`,
    };
  }
  return null;
}

function openPickFilterError(
  catalogItem: OpenPickCatalogItem | null,
  pick: OpenPick,
  chosenName: string,
  creationToolProfs: CreationToolProf[],
): Fail | null {
  if (!catalogItem) {
    return { ok: false, status: 400, error: `Open pick "${chosenName}" is not a known catalog item` };
  }

  const toolCategoryError = toolCategoryFilterError(catalogItem, pick, chosenName);
  if (toolCategoryError) return toolCategoryError;

  if (pick.boundToToolChoice) return boundToolChoiceError(chosenName, creationToolProfs);
  if (pick.filter.toolCategory) return null;

  return weaponFilterError(catalogItem, pick, chosenName);
}

async function validateOpenPick(
  chosenName: string,
  pick: OpenPick,
  creationToolProfs: CreationToolProf[],
): Promise<PhaseResult<{ ref: FixedRef }>> {
  const catalogItem = await prisma.item.findUnique({
    // Pinned to the GLOBAL catalog (#1645) — an unpinned lookup could let a homebrew row shadow the catalog item a package meant.
    where: { scopeKey_name: { scopeKey: "global", name: chosenName } },
    include: { weaponDetail: true },
  });
  const error = openPickFilterError(catalogItem, pick, chosenName, creationToolProfs);
  if (error) return error;
  return { ok: true, ref: { catalogName: chosenName, quantity: pick.quantity ?? 1 } };
}

async function collectOpenPickRefs(
  bundle: EquipmentBundle,
  sel: PackageSelection,
  groupIdx: number,
  creationToolProfs: CreationToolProf[],
): Promise<PhaseResult<{ refs: FixedRef[] }>> {
  const openPicks = bundle.openPicks ?? [];
  const providedPicks = sel.openPicks ?? [];
  if (providedPicks.length !== openPicks.length) {
    return {
      ok: false,
      status: 400,
      error: `Equipment group ${groupIdx}, option ${sel.optionIndex}: expected ${openPicks.length} open picks, got ${providedPicks.length}`,
    };
  }

  const refs: FixedRef[] = [];
  for (let pickIdx = 0; pickIdx < openPicks.length; pickIdx++) {
    const pick = await validateOpenPick(providedPicks[pickIdx], openPicks[pickIdx], creationToolProfs);
    if (!pick.ok) return pick;
    refs.push(pick.ref);
  }
  return { ok: true, refs };
}

// Bundle gold is PHB'24's per-option GP; 0 for every 2014 option.
async function collectGroupRefs(
  group: EquipmentGroup,
  sel: PackageSelection,
  groupIdx: number,
  creationToolProfs: CreationToolProf[],
): Promise<PhaseResult<{ refs: FixedRef[]; gold: number }>> {
  if (sel.optionIndex < 0 || sel.optionIndex >= group.options.length) {
    return {
      ok: false,
      status: 400,
      error: `Equipment group ${groupIdx}: optionIndex ${sel.optionIndex} out of range (0–${group.options.length - 1})`,
    };
  }

  const bundle = group.options[sel.optionIndex];
  const openPickRefs = await collectOpenPickRefs(bundle, sel, groupIdx, creationToolProfs);
  if (!openPickRefs.ok) return openPickRefs;

  return { ok: true, refs: [...bundleFixedRefs(bundle), ...openPickRefs.refs], gold: bundle.gold ?? 0 };
}

async function collectPackageRefs(
  se: PackageEquipment,
  classDef: ClassEquipmentDef,
  creationToolProfs: CreationToolProf[],
): Promise<PhaseResult<{ allFixedRefs: FixedRef[]; totalGold: number }>> {
  if (se.selections.length !== classDef.groups.length) {
    return {
      ok: false,
      status: 400,
      error: `Expected ${classDef.groups.length} equipment selections, got ${se.selections.length}`,
    };
  }

  const allFixedRefs: FixedRef[] = [];
  let totalGold = 0;
  for (let groupIdx = 0; groupIdx < classDef.groups.length; groupIdx++) {
    const group = await collectGroupRefs(classDef.groups[groupIdx], se.selections[groupIdx], groupIdx, creationToolProfs);
    if (!group.ok) return group;
    allFixedRefs.push(...group.refs);
    totalGold += group.gold;
  }
  return { ok: true, allFixedRefs, totalGold };
}

// Exact match, not resolveEditionRow: StartingEquipmentPackage.edition is non-nullable, so there's no shared/NULL row to fall back to (#1534).
async function loadClassEquipmentDef(classId: string, edition: RulesEdition): Promise<ClassEquipmentDef | null> {
  const row = await prisma.startingEquipmentPackage.findUnique({
    where: { classId_edition: { classId, edition } },
    include: EQUIPMENT_PACKAGE_INCLUDE,
  });
  return row ? mapStartingEquipmentPackage(row) : null;
}

async function loadBackgroundEquipmentDef(
  backgroundId: string | null,
  edition: RulesEdition,
): Promise<ClassEquipmentDef | null> {
  if (!backgroundId) return null;
  const row = await prisma.startingEquipmentPackage.findUnique({
    where: { backgroundId_edition: { backgroundId, edition } },
    include: EQUIPMENT_PACKAGE_INCLUDE,
  });
  return row ? mapStartingEquipmentPackage(row) : null;
}

async function resolvePackageInventory(
  se: PackageEquipment,
  subjectLabel: string,
  classDef: ClassEquipmentDef | null,
  creationToolProfs: CreationToolProf[],
): Promise<PhaseResult<{ inventoryItemCreates: InventoryCreate[]; totalGold: number }>> {
  if (!classDef) {
    return {
      ok: false,
      status: 400,
      error: `No starting equipment package defined for ${subjectLabel}`,
    };
  }

  const refs = await collectPackageRefs(se, classDef, creationToolProfs);
  if (!refs.ok) return refs;

  const { inventoryCreates, error } = await resolveFixedItems(refs.allFixedRefs);
  if (error) return { ok: false, status: 400, error };
  return { ok: true, inventoryItemCreates: inventoryCreates, totalGold: refs.totalGold };
}

async function resolveBackgroundEquipmentInventory(
  bse: NonNullable<CreateCharacterBody["backgroundStartingEquipment"]>,
  backgroundId: string | null,
  backgroundDisplayName: string,
  edition: RulesEdition,
  creationToolProfs: CreationToolProf[],
): Promise<PhaseResult<{ inventoryItemCreates: InventoryCreate[]; totalGold: number }>> {
  if (bse.mode === "gold") {
    return {
      ok: false,
      status: 400,
      error: `${backgroundDisplayName} has no roll-for-gold alternative under this ruleset — choose a starting-equipment package option instead`,
    };
  }
  const backgroundDef = await loadBackgroundEquipmentDef(backgroundId, edition);
  return resolvePackageInventory(bse, `background: ${backgroundDisplayName}`, backgroundDef, creationToolProfs);
}

// Class and background equipment GP amounts ADD, never overwrite (#1565).
// Starting weapons/armor auto-equip so the Attack picker isn't empty on a fresh sheet (#51).
async function materializeStartingEquipment(
  input: CreateCharacterBody,
  classId: string,
  primaryClassName: string,
  backgroundId: string | null,
  backgroundDisplayName: string,
  edition: RulesEdition,
  creationToolProfs: CreationToolProf[],
): Promise<PhaseResult<MaterializedEquipment>> {
  const inventoryItemCreates: InventoryCreate[] = [];
  let totalGold = 0;
  // anyEquipmentChosen: omitting both equipment fields keeps deriveCreatedCharacter's default currency untouched.
  let anyEquipmentChosen = false;

  const se = input.startingEquipment;
  if (se) {
    anyEquipmentChosen = true;
    const classDef = await loadClassEquipmentDef(classId, edition);
    if (se.mode === "gold") {
      const gold = resolveStartingGold(se.gold, primaryClassName, classDef);
      if (!gold.ok) return gold;
      totalGold += se.gold;
    } else {
      const pkg = await resolvePackageInventory(se, `class: ${primaryClassName}`, classDef, creationToolProfs);
      if (!pkg.ok) return pkg;
      inventoryItemCreates.push(...pkg.inventoryItemCreates);
      totalGold += pkg.totalGold;
    }
  }

  const bse = input.backgroundStartingEquipment;
  if (bse) {
    anyEquipmentChosen = true;
    const pkg = await resolveBackgroundEquipmentInventory(bse, backgroundId, backgroundDisplayName, edition, creationToolProfs);
    if (!pkg.ok) return pkg;
    inventoryItemCreates.push(...pkg.inventoryItemCreates);
    totalGold += pkg.totalGold;
  }

  // Explicit even at 0 GP so a chosen package can't silently drop its currency (#1564).
  const startingCurrency = anyEquipmentChosen ? { cp: 0, sp: 0, gp: totalGold, pp: 0 } : undefined;

  for (const idx of selectAutoEquip(inventoryItemCreates)) {
    inventoryItemCreates[idx].equippedSlot = autoEquipSlot(inventoryItemCreates[idx]);
  }

  return { ok: true, inventoryItemCreates, startingCurrency };
}

type CreationSpellRow = NonNullable<Awaited<ReturnType<typeof prisma.spell.findFirst>>> & { classes: string[] };

// expandedSpellIds (#1631): a subclass's list expansion (PHB'14 Warlock patrons) widens which spell NAMES are legal, never the level band.
function creationPickError(
  row: CreationSpellRow | undefined,
  id: string,
  kind: "cantrip" | "spell",
  className: string,
  classDisplay: string,
  maxLevel: number,
  expandedSpellIds: Set<string> = new Set(),
): Fail | null {
  if (!row) return { ok: false, status: 400, error: `Unknown spell id: ${id}` };
  if (kind === "cantrip" && row.level !== 0) {
    return { ok: false, status: 400, error: `${row.name} is not a cantrip` };
  }
  if (kind === "spell" && (row.level < 1 || row.level > maxLevel)) {
    return { ok: false, status: 400, error: `${row.name} is not a spell ${classDisplay} can learn at level 1 (max spell level: ${maxLevel})` };
  }
  if (!row.classes.includes(className) && !expandedSpellIds.has(id)) {
    return { ok: false, status: 400, error: `${row.name} is not on the ${classDisplay} spell list` };
  }
  return null;
}

type CreationSpells = NonNullable<CreateCharacterBody["spells"]>;

// picks comes from level1SpellPicksFor, the same function the served reference count uses, so the two can't drift apart.
function creationSpellCountError(
  spells: CreationSpells,
  className: string,
  classDisplay: string,
  edition: RulesEdition,
): Fail | null {
  const picks = level1SpellPicksFor(className, null, edition);
  if (picks == null) {
    return { ok: false, status: 400, error: `${classDisplay} does not cast spells at level 1` };
  }
  if (spells.cantripIds.length !== picks.cantrips) {
    return { ok: false, status: 400, error: `Expected ${picks.cantrips} cantrip(s), got ${spells.cantripIds.length}` };
  }
  if (spells.spellIds.length !== picks.spells) {
    return { ok: false, status: 400, error: `Expected ${picks.spells} level-1 spell(s), got ${spells.spellIds.length}` };
  }
  const allIds = [...spells.cantripIds, ...spells.spellIds];
  if (new Set(allIds).size !== allIds.length) {
    return { ok: false, status: 400, error: "A spell can be chosen only once" };
  }
  return null;
}

async function resolveCreationSpells(
  input: CreateCharacterBody,
  selections: ResolvedSelections,
): Promise<PhaseResult<{ spellEntries: SpellEntry[] | null }>> {
  const { spells } = input;
  if (!spells) return { ok: true, spellEntries: null };

  const classDisplay = selections.characterClass.name;
  const className = classDisplay.toLowerCase();
  const { edition } = selections;
  const countError = creationSpellCountError(spells, className, classDisplay, edition);
  if (countError) return countError;

  const allIds = [...spells.cantripIds, ...spells.spellIds];
  const rows = allIds.length
    ? await prisma.spell.findMany({ where: { id: { in: allIds } }, include: SPELL_CLASS_MEMBERSHIP_SELECT })
    : [];
  const forkError = await rejectCrossEditionSpellForks(rows, edition);
  if (forkError) return { ok: false, status: 400, error: forkError };
  const byId = new Map(rows.map((r) => [r.id, { ...r, classes: classesOf(r) }]));
  const maxLevel = maxSpellLevelForClass(className, 1, null, edition);
  const expandedSpellIds = new Set(await loadSubclassSpellListExpansionIds(selections.subclassId, edition));

  const entries: SpellEntry[] = [];
  for (const [ids, kind] of [[spells.cantripIds, "cantrip"], [spells.spellIds, "spell"]] as const) {
    for (const id of ids) {
      const row = byId.get(id);
      const error = creationPickError(row, id, kind, className, classDisplay, maxLevel, expandedSpellIds);
      if (error) return error;
      entries.push(creationSpellEntry(row!));
    }
  }
  return { ok: true, spellEntries: entries };
}

async function speciesCantripListError(
  row: CreationSpellRow | undefined,
  id: string,
  spells: string[],
  edition: RulesEdition,
): Promise<Fail | null> {
  if (!row) return { ok: false, status: 400, error: `Unknown spell id: ${id}` };
  if (row.level !== 0) return { ok: false, status: 400, error: `${row.name} is not a cantrip` };
  if (!spells.includes(row.name)) {
    return { ok: false, status: 400, error: `speciesCantripId: ${row.name} is not one of this species' cantrip options` };
  }
  const forkError = await rejectCrossEditionSpellForks([row], edition);
  return forkError ? { ok: false, status: 400, error: forkError } : null;
}

async function resolveSpeciesCantripGrant(
  input: CreateCharacterBody,
  spec: ChooseCantrip | null,
  existingEntries: SpellEntry[],
  edition: RulesEdition,
): Promise<PhaseResult<{ entry: SpellEntry | null }>> {
  const { speciesCantripId } = input;
  if (!spec) {
    if (speciesCantripId) {
      return { ok: false, status: 400, error: "speciesCantripId not allowed: this species has no cantrip choice" };
    }
    return { ok: true, entry: null };
  }
  if (!speciesCantripId) {
    return { ok: false, status: 400, error: "speciesCantripId required: this species grants a choice of cantrip" };
  }
  if (existingEntries.some((e) => e.spellId === speciesCantripId)) {
    return { ok: false, status: 400, error: "speciesCantripId duplicates a class-picked spell" };
  }
  const raw = await prisma.spell.findUnique({
    where: { id: speciesCantripId },
    include: SPELL_CLASS_MEMBERSHIP_SELECT,
  });
  const row = raw ? { ...raw, classes: classesOf(raw) } : undefined;
  const error = await speciesCantripPickError(row, speciesCantripId, spec, edition);
  if (error) return error;
  const entry: SpellEntry = { ...creationSpellEntry(row!), source: "species", castingAbility: spec.castingAbility ?? input.castingAbility };
  return { ok: true, entry };
}

async function speciesCantripPickError(
  row: CreationSpellRow | undefined,
  id: string,
  spec: ChooseCantrip,
  edition: RulesEdition,
): Promise<Fail | null> {
  if (spec.spells) return speciesCantripListError(row, id, spec.spells, edition);
  const classDisplay = spec.list!.charAt(0).toUpperCase() + spec.list!.slice(1);
  return creationPickError(row, id, "cantrip", spec.list!, classDisplay, 0);
}

function speciesOriginFeatNotServedResult(speciesOriginFeatId: string | undefined): PhaseResult<{ entry: null }> {
  if (speciesOriginFeatId) {
    return { ok: false, status: 400, error: "speciesOriginFeatId not allowed: this species has no Origin feat choice" };
  }
  return { ok: true, entry: null };
}

type OriginFeatRow = NonNullable<Awaited<ReturnType<typeof prisma.feat.findUnique>>>;

function validateOriginFeatRow(feat: OriginFeatRow, edition: RulesEdition): Fail | null {
  const mismatch = crossEditionRejection(feat, `Feat "${feat.name}"`, edition);
  if (mismatch) return { ok: false, status: 400, error: mismatch };
  if (feat.category !== "origin") {
    return { ok: false, status: 400, error: `speciesOriginFeatId: "${feat.name}" is not an Origin feat` };
  }
  return null;
}

// PHB'24: an Origin feat is normally taken once; taking it twice is legal only when the feat is explicitly repeatable (Magic Initiate, Skilled).
function originFeatDuplicateError(feat: OriginFeatRow, backgroundOriginEntry: AdvancementEntry | null): Fail | null {
  if (backgroundOriginEntry?.featId === feat.id && !feat.repeatable) {
    return {
      ok: false,
      status: 400,
      error: `speciesOriginFeatId: "${feat.name}" duplicates your background's Origin feat and is not repeatable`,
    };
  }
  return null;
}

// Same slot-exempt AdvancementEntry shape as buildOriginEntry — just resolved from a player-chosen feat instead of the background's fixed FK.
function buildSpeciesOriginFeatEntry(feat: OriginFeatRow): AdvancementEntry {
  return {
    id: randomUUID(),
    level: 1,
    kind: "feat",
    origin: true,
    abilityDeltas: {},
    hpDelta: 0,
    initDelta: 0,
    featId: feat.id,
    featName: feat.name,
    featDescription: feat.description,
    improvements: (feat.improvements as unknown as FeatImprovement[]) ?? [],
  };
}

async function resolveSpeciesOriginFeatGrant(
  input: CreateCharacterBody,
  hasSpec: boolean,
  edition: RulesEdition,
  backgroundOriginEntry: AdvancementEntry | null,
): Promise<PhaseResult<{ entry: AdvancementEntry | null }>> {
  const { speciesOriginFeatId } = input;
  if (!hasSpec) return speciesOriginFeatNotServedResult(speciesOriginFeatId);
  if (!speciesOriginFeatId) {
    return { ok: false, status: 400, error: "speciesOriginFeatId required: this species grants a choice of Origin feat" };
  }
  const feat = await prisma.feat.findUnique({ where: { id: speciesOriginFeatId } });
  if (!feat) {
    return { ok: false, status: 400, error: `Unknown feat id: ${speciesOriginFeatId}` };
  }
  const rowError = validateOriginFeatRow(feat, edition);
  if (rowError) return rowError;
  const dupError = originFeatDuplicateError(feat, backgroundOriginEntry);
  if (dupError) return dupError;
  return { ok: true, entry: buildSpeciesOriginFeatEntry(feat) };
}

function creationResources(originEntries: (AdvancementEntry | null)[]): Prisma.InputJsonValue | undefined {
  const entries = originEntries.filter((e): e is AdvancementEntry => e != null);
  if (entries.length === 0) return undefined;
  const state = normalizeResourcesMutable(null);
  state.advancements = entries;
  return serializeResourcesState(state);
}

function creationSpellcasting(spellEntries: SpellEntry[] | null): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (!spellEntries) return Prisma.JsonNull;
  return { slotsUsed: {}, arcanumUsed: {}, spells: spellEntries, concentratingOn: null } as unknown as Prisma.InputJsonValue;
}

// clampPreparedToLimit is the SAME rule buildSpellcastingView's read-side clamp uses (#1127) — keeps the stored blob equal to the served view.
function clampCreationSpellEntries(
  spellEntries: SpellEntry[] | null,
  primaryClassChoice: PrimaryClassChoice,
  selections: ResolvedSelections,
  effectiveScores: Record<string, number>,
): SpellEntry[] | null {
  if (!spellEntries) return null;
  const limit = derivePreparedSpellLimit(
    [{ name: primaryClassChoice.name, level: 1 }],
    effectiveScores,
    selections.edition,
  );
  return clampPreparedToLimit(spellEntries, limit).spells;
}

function speciesCantripEntryOf(spellEntries: SpellEntry[] | null): SpellEntry | null {
  return spellEntries?.find((e) => e.source === "species") ?? null;
}

function raceSelectionCreateInput(
  input: CreateCharacterBody,
  selections: ResolvedSelections,
  appliedIncreases: SpeciesGrants["appliedIncreases"],
  speciesCantripName: string | null,
  speciesOriginFeatName: string | null,
  castingAbility: string | null,
) {
  const { speciesSelection } = selections;
  return {
    name: speciesSelection.variantName ?? speciesSelection.speciesName,
    speciesId: speciesSelection.speciesId,
    variantId: speciesSelection.variantId,
    variantName: speciesSelection.variantName,
    abilityBonuses: appliedIncreases as unknown as Prisma.InputJsonValue,
    castingAbility,
    speciesSkills: input.speciesSkills ?? [],
    speciesCantripName,
    // Provenance only — the functional grant lives in resources.advancements via creationResources, not this column.
    speciesOriginFeatName,
  };
}

function resourcesField(resources: Prisma.InputJsonValue | undefined): { resources?: Prisma.InputJsonValue } {
  return resources ? { resources } : {};
}
function currencyField(startingCurrency: MaterializedEquipment["startingCurrency"]) {
  return startingCurrency ? { currency: startingCurrency } : {};
}
function inventoryItemsField(inventoryItemCreates: InventoryCreate[]) {
  return inventoryItemCreates.length > 0
    ? { inventoryItems: { create: inventoryItemCreates.map(stripInventoryCreateForWrite) } }
    : {};
}

async function persistCreatedCharacter(
  input: CreateCharacterBody,
  ownerId: string,
  selections: ResolvedSelections,
  equipment: MaterializedEquipment,
  spellEntries: SpellEntry[] | null,
  grants: BackgroundGrants,
  speciesGrants: SpeciesGrants,
  speciesOriginFeatEntry: AdvancementEntry | null,
  castingAbility: string | null,
): Promise<{ id: string }> {
  const { characterClass, background, primaryClassChoice } = selections;
  const { inventoryItemCreates, startingCurrency } = equipment;
  const { originEntry } = grants;
  const { effectiveScores, appliedIncreases } = speciesGrants;

  // Background spread and species increases are baked into effectiveScores BEFORE derivation, with no reversible delta record (#1130, #1681).
  const derived = deriveCreatedCharacter(
    {
      abilityScores: effectiveScores,
      skillProficiencies: selections.skillProficiencies,
      toolProficiencies: selections.creationToolProfs,
    },
    { species: { speed: selections.speciesSelection.speed }, characterClass }
  );

  const resources = creationResources([originEntry, speciesOriginFeatEntry]);
  const clampedSpellEntries = clampCreationSpellEntries(spellEntries, primaryClassChoice, selections, effectiveScores);
  const speciesCantripName = speciesCantripEntryOf(spellEntries)?.name ?? null;

  const created = await prisma.character.create({
    data: {
      owner: { connect: { id: ownerId } },
      name: input.name,
      alignment: input.alignment,
      // The only write of rulesEdition (write-once, #1285) — re-derives via the SAME DEFAULT_RULES_EDITION formula resolveSelections used, so the two can't drift.
      rulesEdition: input.rulesEdition ?? DEFAULT_RULES_EDITION,
      experiencePoints: input.experiencePoints ?? 0,
      abilityScores: effectiveScores,
      ...derived,
      ...resourcesField(resources),
      // ToolProficiencyEntry[] safely casts to Prisma.InputJsonValue for this Json column.
      toolProficiencies: derived.toolProficiencies as unknown as Prisma.InputJsonValue,
      ...currencyField(startingCurrency),
      spellcasting: creationSpellcasting(clampedSpellEntries),
      raceSelection: {
        create: raceSelectionCreateInput(
          input,
          selections,
          appliedIncreases,
          speciesCantripName,
          speciesOriginFeatEntry?.featName ?? null,
          castingAbility,
        ),
      },
      backgroundSelection: {
        create: { name: input.background, backgroundId: background?.id ?? null },
      },
      classEntries: {
        create: [
          {
            name: primaryClassChoice.name,
            subclass: selections.subclassName,
            subclassId: selections.subclassId,
            classId: characterClass.id,
            position: 0,
          },
        ],
      },
      ...inventoryItemsField(inventoryItemCreates),
    },
    select: { id: true },
  });

  return { id: created.id };
}

export async function createCharacter(
  input: CreateCharacterBody,
  ownerId: string,
): Promise<CreateCharacterResult> {
  const selections = await resolveSelections(input);
  if (!selections.ok) return selections;

  const grants = await resolveBackgroundGrants(input, selections.background, input.rulesEdition ?? DEFAULT_RULES_EDITION);
  if (!grants.ok) return grants;

  const speciesGrants = await resolveSpeciesGrants(input, selections.speciesSelection, selections.edition, grants.effectiveScores);
  if (!speciesGrants.ok) return speciesGrants;

  const castingAbilityResult = await resolveCastingAbility(input, selections.speciesSelection, selections.speciesChoiceSpecs.chooseCantrip);
  if (!castingAbilityResult.ok) return castingAbilityResult;

  const equipment = await materializeStartingEquipment(
    input,
    selections.characterClass.id,
    selections.primaryClassChoice.name,
    selections.background?.id ?? null,
    input.background,
    input.rulesEdition ?? DEFAULT_RULES_EDITION,
    selections.creationToolProfs,
  );
  if (!equipment.ok) return equipment;

  const spells = await resolveCreationSpells(input, selections);
  if (!spells.ok) return spells;

  const speciesCantrip = await resolveSpeciesCantripGrant(input, selections.speciesChoiceSpecs.chooseCantrip, spells.spellEntries ?? [], selections.edition);
  if (!speciesCantrip.ok) return speciesCantrip;
  const spellEntries = speciesCantrip.entry ? [...(spells.spellEntries ?? []), speciesCantrip.entry] : spells.spellEntries;

  const speciesOriginFeat = await resolveSpeciesOriginFeatGrant(
    input,
    selections.speciesChoiceSpecs.chooseOriginFeat,
    selections.edition,
    grants.originEntry,
  );
  if (!speciesOriginFeat.ok) return speciesOriginFeat;

  const { id } = await persistCreatedCharacter(
    input,
    ownerId,
    selections,
    equipment,
    spellEntries,
    grants,
    speciesGrants,
    speciesOriginFeat.entry,
    castingAbilityResult.castingAbility,
  );
  return { ok: true, id };
}
