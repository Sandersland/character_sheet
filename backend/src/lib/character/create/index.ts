import { DEFAULT_RULES_EDITION } from "@/lib/rules/edition.js";
import { validateAbilityScores } from "@/lib/srd/ability-generation.js";
import type { CreateCharacterBody } from "@/lib/character/character-schemas.js";
import { resolveSelections } from "./selections.js";
import { resolveBackgroundGrants } from "./background-grants.js";
import { resolveSpeciesGrants } from "./species-grants.js";
import { resolveCastingAbility } from "./casting-ability.js";
import { materializeStartingEquipment } from "./equipment.js";
import { resolveCreationSpells } from "./spells.js";
import { resolveSpeciesCantripGrant } from "./species-cantrip.js";
import { resolveSpeciesOriginFeatGrant } from "./species-origin-feat.js";
import { persistCreatedCharacter } from "./persist.js";

export type CreateCharacterResult =
  | { ok: true; id: string }
  | { ok: false; status: 400; error: string };

// Runs before any DB access: the pre-bonus scores are self-contained input,
// so a crafted request (e.g. straight 20s under a false "standardArray"/
// "pointBuy" claim) 400s before touching a query. abilityScores is required
// by createCharacterSchema — the undefined case here is only for direct
// (schema-bypassing) callers, e.g. unit tests targeting an earlier check.
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
