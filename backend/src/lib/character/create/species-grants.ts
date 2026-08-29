import { prisma } from "@/lib/core/prisma.js";
import { applyAbilitySpread, floatingSpreadShapeValid, speciesGrantsAbilityIncreases } from "@/lib/rules/background-grants.js";
import {
  ABILITY_NAMES,
  type AbilityIncreaseSpec,
  type ChooseIncrease,
} from "@/lib/srd/species-ability-increases.js";
import type { AbilityGenerationMethod, RulesEdition } from "@character-sheet/shared-types";
import type { CreateCharacterBody } from "@/lib/character/character-schemas.js";
import { abilityCapOverflowError, type Fail, type PhaseResult, type SpeciesGrants, type SpeciesSelection } from "./shared.js";

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
  method: AbilityGenerationMethod | undefined,
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
  return abilityCapOverflowError(entries, base, "speciesAbilities", method) ?? { chosen: Object.fromEntries(entries) };
}

// Shared shape check — see floatingSpreadShapeValid.
function validateSpeciesFloating(
  submitted: Record<string, number>,
  fixedAbilities: Set<string>,
  base: Record<string, number>,
  method: AbilityGenerationMethod | undefined,
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
  return abilityCapOverflowError(entries, base, "speciesAbilities", method) ?? { chosen: Object.fromEntries(entries) };
}

function resolveChosenIncreases(
  chooseSpecs: ChooseIncrease[],
  floatingSpecs: number[],
  submitted: Record<string, number> | undefined,
  fixedAbilities: Set<string>,
  base: Record<string, number>,
  method: AbilityGenerationMethod | undefined,
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
    return validateSpeciesChoose(chooseSpecs[0], submitted, fixedAbilities, base, method);
  }
  return validateSpeciesFloating(submitted, fixedAbilities, base, method);
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

// The one place species.abilityIncreases is read — resolveSpeciesCatalogRow deliberately avoids this column for every candidate variant.
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
export async function resolveSpeciesGrants(
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
  const fixedCapError = abilityCapOverflowError(Object.entries(fixedSpread), baseScores, "species", input.abilityGenerationMethod);
  if (fixedCapError) return fixedCapError;

  const chosenResult = resolveChosenIncreases(
    chooseSpecs,
    floatingSpecs,
    submitted,
    new Set(Object.keys(fixedSpread)),
    baseScores,
    input.abilityGenerationMethod,
  );
  if ("ok" in chosenResult) return chosenResult;

  const fullSpread = { ...fixedSpread, ...chosenResult.chosen };
  return {
    ok: true,
    effectiveScores: applyAbilitySpread(baseScores, fullSpread),
    appliedIncreases: Object.entries(fullSpread).map(([ability, amount]) => ({ ability, amount })),
  };
}
