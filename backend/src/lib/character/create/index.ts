import { DEFAULT_RULES_EDITION } from "@/lib/rules/edition.js";
import { validateAbilityScores } from "@/lib/srd/ability-generation.js";
import type { CreateCharacterBody } from "@/lib/character/character-schemas.js";
import { resolveSelections } from "./selections.js";
import { resolveBackgroundGrants } from "./background-grants.js";
import { resolveSpeciesGrants } from "./species-grants.js";
import { resolveCastingAbility } from "./casting-ability.js";
import { materializeStartingEquipment } from "./equipment.js";
import { resolveSpellPhase } from "./species-cantrip.js";
import { resolveSpeciesOriginFeatGrant } from "./species-origin-feat.js";
import { persistCreatedCharacter } from "./persist.js";

export type CreateCharacterResult =
  | { ok: true; id: string }
  | { ok: false; status: 400; error: string };

// Pre-bonus scores only — self-contained, so this runs before any DB access.
// abilityScores is required by createCharacterSchema; the undefined branch serves direct callers only.
function abilityScoresGuard(input: CreateCharacterBody): CreateCharacterResult | null {
  if (!input.abilityScores) return null;
  const result = validateAbilityScores(input.abilityGenerationMethod, input.abilityScores);
  return result.ok ? null : { ok: false, status: 400, error: result.error };
}

export async function createCharacter(
  input: CreateCharacterBody,
  ownerId: string,
): Promise<CreateCharacterResult> {
  const scoresError = abilityScoresGuard(input);
  if (scoresError) return scoresError;

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

  const spellPhase = await resolveSpellPhase(input, selections);
  if (!spellPhase.ok) return spellPhase;
  const { spellEntries } = spellPhase;

  const speciesOriginFeat = await resolveSpeciesOriginFeatGrant(
    input,
    selections.speciesChoiceSpecs.chooseOriginFeat,
    selections.edition,
    grants.originEntry,
  );
  if (!speciesOriginFeat.ok) return speciesOriginFeat;

  const { id } = await persistCreatedCharacter({
    input,
    ownerId,
    selections,
    equipment,
    spellEntries,
    grants,
    speciesGrants,
    speciesOriginFeatEntry: speciesOriginFeat.entry,
    castingAbility: castingAbilityResult.castingAbility,
  });
  return { ok: true, id };
}
