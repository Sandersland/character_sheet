import { ABILITY_ORDER, abilityModifier } from "@/lib/abilities";
import { draftToInput } from "@/lib/startingEquipment";
import type { CharacterDraft } from "@/hooks/useCharacterDraft";
import type {
  AbilityIncreaseSpec,
  AbilityName,
  BackgroundOption,
  ClassOption,
  CreateCharacterInput,
  OriginFeatOption,
  RaceOption,
  ReferenceData,
  SkillName,
  SpeciesOption,
  SpeciesVariantOption,
  StartingEquipmentInput,
} from "@/types/character";

export interface CreationSelections {
  /** #1680: the two-step picker's own selection. */
  species: SpeciesOption | undefined;
  variant: SpeciesVariantOption | undefined;
  /** Legacy flat-catalog row sharing the chosen species/variant's NAME, if one
   *  exists — kept only as useToolProficiencyChoices' (currently dormant)
   *  race-granted-tool-proficiency source, never the picker's own source of
   *  truth. Absent whenever no flat `Race` row shares that name (e.g. a 2024
   *  species the flat legacy list never carried). */
  race: RaceOption | undefined;
  class: ClassOption | undefined;
  background: BackgroundOption | undefined;
}

export interface CreationSkillChoices {
  granted: SkillName[];
  options: SkillName[];
  max: number;
  selected: SkillName[];
}

export interface CreationPreview {
  armorClass: number;
  dexModifier: number;
  speed: number | undefined;
  maxHp: number | undefined;
}

export interface CreationBackgroundBonuses {
  /** True when the selected (non-custom) background carries a 2024 ability spread. */
  applicable: boolean;
  /** The three abilities the spread draws from (empty when not applicable). */
  abilities: AbilityName[];
  /** The Origin feat the background grants, if any. */
  originFeat: OriginFeatOption | null;
  /** Current per-ability assignment restricted to the three choices. */
  assignment: Partial<Record<AbilityName, number>>;
  /** Whether the assignment is a legal +2/+1 or +1/+1/+1 spread. */
  complete: boolean;
}

// A legal PHB'24 spread is +2/+1 (two abilities) or +1/+1/+1 (three) — sums to 3.
function isValidSpread(values: number[]): boolean {
  const sorted = [...values].sort((a, b) => a - b);
  const isTwoOne = sorted.length === 2 && sorted[0] === 1 && sorted[1] === 2;
  const isOneOneOne = sorted.length === 3 && sorted.every((v) => v === 1);
  return isTwoOne || isOneOneOne;
}

// Restrict the draft's raw assignment to the three abilities with positive bumps.
function pickAssignment(
  raw: Partial<Record<AbilityName, number>>,
  abilities: AbilityName[],
): Partial<Record<AbilityName, number>> {
  const assignment: Partial<Record<AbilityName, number>> = {};
  for (const ability of abilities) {
    const value = raw[ability];
    if (value && value > 0) assignment[ability] = value;
  }
  return assignment;
}

// Derives the background ability-spread state for the form: which abilities are
// in play, the origin feat, the current assignment, and whether it's complete.
// Inert (applicable:false) for custom or spec-less (Folk Hero) backgrounds (#1130).
export function deriveBackgroundBonuses(
  draft: CharacterDraft,
  selections: CreationSelections,
): CreationBackgroundBonuses {
  const background = draft.useCustomBackground ? undefined : selections.background;
  const abilities = background?.abilityChoices ?? [];
  const applicable = abilities.length > 0;
  const assignment = pickAssignment(draft.backgroundAbilities, abilities);
  return {
    applicable,
    abilities,
    originFeat: background?.originFeat ?? null,
    assignment,
    complete: applicable && isValidSpread(Object.values(assignment)),
  };
}

export interface CreationSpeciesBonuses {
  /** True when the matched species+variant's merged spec carries a fixed
   *  increase, a choice, or both. False renders no panel — 2024 always false
   *  (every 2024 row's spec is []), matching #1681's backend gate. */
  applicable: boolean;
  /** Fixed increases, auto-applied server-side — already summed across
   *  species + variant (Hill Dwarf: {constitution: 2, wisdom: 1}). */
  fixed: Partial<Record<AbilityName, number>>;
  /** The choose-from-list requirement (Half-Elf's "+1 to two of your
   *  choice"), or null when the merged spec has none. Only the FIRST choose
   *  spec is interactively supported — no #1681 wave-1 content seeds more
   *  than one; a floating spec (Astral Elf shape) is likewise not yet
   *  interactive here, since no real PHB'14 roster row uses one this wave. */
  choice: { count: number; amount: number; abilities: AbilityName[] } | null;
  /** Current assignment, restricted to the choice's eligible abilities. */
  assignment: Partial<Record<AbilityName, number>>;
  /** True when there's no choice to make, or the assignment satisfies it. */
  complete: boolean;
}

// Splits a merged species+variant abilityIncreases spec array into its fixed
// spread (summed per ability) and its first choose spec (eligible abilities
// narrowed to exclude anything already fixed — mirrors resolveSpeciesGrants'
// server-side fixedAbilities exclusion in character-create.ts).
function splitSpeciesIncreases(specs: AbilityIncreaseSpec[]): {
  fixed: Partial<Record<AbilityName, number>>;
  choice: { count: number; amount: number; abilities: AbilityName[] } | null;
} {
  const fixed: Partial<Record<AbilityName, number>> = {};
  const chooseSpecs: NonNullable<Extract<AbilityIncreaseSpec, { choose: unknown }>>["choose"][] = [];
  for (const spec of specs) {
    if ("ability" in spec) {
      fixed[spec.ability] = (fixed[spec.ability] ?? 0) + spec.amount;
    } else if ("choose" in spec) {
      chooseSpecs.push(spec.choose);
    }
  }
  const first = chooseSpecs[0];
  const choice = first
    ? {
        count: first.count,
        amount: first.amount,
        abilities: (first.from ?? [...ABILITY_ORDER]).filter((a) => fixed[a] === undefined),
      }
    : null;
  return { fixed, choice };
}

// Derives the species ability-increase state for the form: the auto-applied
// fixed bumps, the choose requirement (if any), the current assignment, and
// whether it's complete. Inert (applicable:false) for a variantless/unmatched
// race name or a species whose merged spec is empty (every 2024 species).
export function deriveSpeciesBonuses(
  draft: CharacterDraft,
  selections: CreationSelections,
): CreationSpeciesBonuses {
  const specs = [
    ...(selections.species?.abilityIncreases ?? []),
    ...(selections.variant?.abilityIncreases ?? []),
  ];
  const { fixed, choice } = splitSpeciesIncreases(specs);
  const applicable = Object.keys(fixed).length > 0 || choice !== null;
  const assignment = choice ? pickAssignment(draft.speciesAbilities, choice.abilities) : {};
  const complete =
    !choice || (Object.keys(assignment).length === choice.count && Object.values(assignment).every((v) => v === choice.amount));
  return { applicable, fixed, choice, assignment, complete };
}

export interface CreationCastingAbilityChoice {
  /** True when the resolved variant (or species, for a future species-level
   *  grant) needs the Int/Wis/Cha choice — SpeciesVariantOption/SpeciesOption's
   *  own served `needsCastingAbility` flag, never re-derived client-side. */
  applicable: boolean;
  /** The current draft value, narrowed to the wire enum (or "" = unset). */
  value: "" | "intelligence" | "wisdom" | "charisma";
  /** True when there's no choice to make, or a value has been picked. */
  complete: boolean;
}

/**
 * Derives the #1683 casting-ability choice state for the form: whether the
 * chosen species+variant needs it (server-resolved, via needsCastingAbility)
 * and whether the draft has answered it. The variant's own flag wins when a
 * variant is chosen (mirrors deriveSpeciesBonuses' merge precedent); falls
 * back to the species' own flag for a variantless species (no real PHB'24
 * row needs this yet — every 2024 grant this wave is variant-scoped).
 */
export function deriveCastingAbilityChoice(
  draft: CharacterDraft,
  selections: CreationSelections,
): CreationCastingAbilityChoice {
  const applicable = selections.variant?.needsCastingAbility ?? selections.species?.needsCastingAbility ?? false;
  return {
    applicable,
    value: draft.castingAbility,
    complete: !applicable || draft.castingAbility !== "",
  };
}

function hitDieFace(hitDie: string): number {
  return Number(hitDie.replace(/^d/i, ""));
}

// Match the draft's chosen species/variant/class/background to reference
// entries. species/variant resolve by id (#1680, like subclassId); class/
// background still resolve by name.
export function resolveSelections(
  reference: ReferenceData | null,
  draft: CharacterDraft
): CreationSelections {
  const species = reference?.species.find((s) => s.id === draft.speciesId);
  const variant = species?.variants.find((v) => v.id === draft.variantId);
  return {
    species,
    variant,
    race: reference?.races.find((r) => r.name === (variant?.name ?? species?.name)),
    class: reference?.classes.find((c) => c.name === draft.className),
    background: reference?.backgrounds.find((b) => b.name === draft.background),
  };
}

// Granted skills come from the (non-custom) background; the player picks the
// rest from the class list, excluding already-granted ones, up to the cap.
export function deriveSkillChoices(
  draft: CharacterDraft,
  selections: CreationSelections
): CreationSkillChoices {
  const granted = draft.useCustomBackground ? [] : selections.background?.skillProficiencies ?? [];
  const options = (selections.class?.skillChoices ?? []).filter((s) => !granted.includes(s));
  const max = selections.class?.skillChoiceCount ?? 0;
  const selected = draft.skillProficiencies.filter((s) => options.includes(s));
  return { granted, options, max, selected };
}

// Custom backgrounds submit the trimmed free-text name; otherwise the list pick.
export function resolveBackgroundName(draft: CharacterDraft): string {
  return draft.useCustomBackground ? draft.customBackground.trim() : draft.background;
}

// An untouched (null) equipment draft submits nothing — the character simply
// starts with no inventory.
export function resolveEquipmentInput(
  draft: CharacterDraft,
  selectedClass: ClassOption | undefined
): StartingEquipmentInput | undefined {
  if (!draft.equipmentDraft || !selectedClass?.startingEquipment) return undefined;
  return draftToInput(selectedClass.startingEquipment, draft.equipmentDraft) ?? undefined;
}

// #1565's twin of resolveEquipmentInput above, for the background's OWN
// package (a background with no seeded package — a 2014 background other than
// Acolyte and Folk Hero, or homebrew — never has a draft to resolve, same
// "untouched submits nothing" shape).
export function resolveBackgroundEquipmentInput(
  draft: CharacterDraft,
  selectedBackground: BackgroundOption | undefined
): StartingEquipmentInput | undefined {
  if (!draft.backgroundEquipmentDraft || !selectedBackground?.startingEquipment) return undefined;
  return draftToInput(selectedBackground.startingEquipment, draft.backgroundEquipmentDraft) ?? undefined;
}

// Fold the background spread's AND the species increases' (#1681) current
// assignments into the base scores so the preview (AC / init / HP) reflects
// what the backend will bake in (#1130 / #1681) — the two never both
// contribute in practice (opposite-edition mechanics), but folding both here
// unconditionally means the preview needs no edition branch of its own.
function effectiveCreationScores(
  draft: CharacterDraft,
  selections: CreationSelections
): Record<AbilityName, number> {
  const bonuses = deriveBackgroundBonuses(draft, selections);
  const speciesBonuses = deriveSpeciesBonuses(draft, selections);
  const scores = { ...draft.abilityScores };
  for (const [ability, amount] of Object.entries(bonuses.assignment)) {
    scores[ability as AbilityName] += amount ?? 0;
  }
  for (const [ability, amount] of [...Object.entries(speciesBonuses.fixed), ...Object.entries(speciesBonuses.assignment)]) {
    scores[ability as AbilityName] += amount ?? 0;
  }
  return scores;
}

export function derivePreview(
  draft: CharacterDraft,
  selections: CreationSelections
): CreationPreview {
  const scores = effectiveCreationScores(draft, selections);
  const dexModifier = abilityModifier(scores.dexterity);
  const conModifier = abilityModifier(scores.constitution);
  return {
    armorClass: 10 + dexModifier,
    dexModifier,
    // #1680: species.speed, not the legacy race match — it's the edition-
    // accurate value GET /api/reference actually serves for the chosen
    // species (e.g. 2024 Dwarf is 30 ft, not the flat catalog's 2014 25 ft).
    speed: selections.species?.speed,
    maxHp: selections.class
      ? Math.max(1, hitDieFace(selections.class.hitDie) + conModifier)
      : undefined,
  };
}

export function buildCreatePayload(
  draft: CharacterDraft,
  selections: CreationSelections,
  skills: CreationSkillChoices,
  selectedToolChoices: string[]
): CreateCharacterInput {
  const backgroundBonuses = deriveBackgroundBonuses(draft, selections);
  const speciesBonuses = deriveSpeciesBonuses(draft, selections);
  const castingAbilityChoice = deriveCastingAbilityChoice(draft, selections);
  return {
    name: draft.name.trim(),
    alignment: draft.alignment,
    // POST /api/characters still requires `race` as a display-name string
    // (#1679's compat window, pruned in #1684) — resolved from the chosen
    // species/variant's own name so it always echoes what the two-step
    // picker (#1680) shows, rather than a second, separately-picked value.
    race: selections.variant?.name ?? selections.species?.name ?? "",
    speciesId: draft.speciesId || undefined,
    variantId: draft.variantId || undefined,
    // Only send a completed CHOICE; a fixed-only species (or none) sends
    // undefined — the backend applies fixed increases unconditionally with no
    // request field and 400s a speciesAbilities it didn't ask for (#1681).
    speciesAbilities: speciesBonuses.choice && speciesBonuses.complete ? speciesBonuses.assignment : undefined,
    // #1683: only send a completed choice; a species/variant that grants no
    // spell (or an unanswered choice) sends undefined — the backend 400s a
    // castingAbility it didn't ask for (resolveCastingAbility, character-create.ts).
    castingAbility: castingAbilityChoice.applicable && castingAbilityChoice.value ? castingAbilityChoice.value : undefined,
    background: resolveBackgroundName(draft),
    classes: [{
      name: draft.className,
      subclass: draft.subclass.trim() || null,
      subclassId: draft.subclassId || undefined,
    }],
    abilityScores: draft.abilityScores,
    // Only send a complete spread; the backend derives HP/init from it (#1130).
    backgroundAbilities: backgroundBonuses.complete ? backgroundBonuses.assignment : undefined,
    skillProficiencies: [...skills.granted, ...skills.selected],
    toolChoices: selectedToolChoices.length > 0 ? selectedToolChoices : undefined,
    startingEquipment: resolveEquipmentInput(draft, selections.class) ?? undefined,
    backgroundStartingEquipment: resolveBackgroundEquipmentInput(draft, selections.background) ?? undefined,
    // #1131: casters send their prepared picks; a non-caster omits the field.
    ...(selections.class?.level1SpellPicks
      ? { spells: { cantripIds: draft.cantripIds, spellIds: draft.spellIds } }
      : {}),
    // #1286: resolved by CreationEntryGate before the ceremony is reachable, so
    // this is always set by the time a real submit happens (never a silent default).
    rulesEdition: draft.rulesEdition ?? undefined,
  };
}
