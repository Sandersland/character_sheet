import { ABILITY_ORDER, abilityModifier, SKILL_OPTIONS } from "@/lib/abilities";
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
  SpeciesCantripChoiceOption,
  SpeciesOption,
  SpeciesSkillChoiceOption,
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

export interface CreationSpeciesSkillChoice {
  /** False renders no panel — driven purely by the served spec (#1572
   *  trick), never a client edition check. */
  applicable: boolean;
  count: number;
  /** Eligible skill options for the picker, already resolved to the served
   *  `from` restriction (or every skill, absent one) MINUS whatever the
   *  class/background step already granted/picked — a species pick may not
   *  duplicate those (server-enforced; this list keeps the picker from ever
   *  offering an option that would 400). */
  options: { key: SkillName; label: string }[];
  selected: SkillName[];
  complete: boolean;
}

// Derives the species skill-choice state for the form (#1689, Half-Elf's
// Skill Versatility): the served spec (species-level OR variant-level — only
// one is ever populated this wave), the eligible options narrowed by BOTH the
// spec's own `from` restriction and the class/background skills already
// spoken for, and whether the current selection satisfies the count. Inert
// (applicable:false) whenever the server serves no chooseSkills for this
// species+variant — every 2024 species, Half-Elf's own is the only 2014 row
// this wave.
export function deriveSpeciesSkillChoice(
  draft: CharacterDraft,
  selections: CreationSelections,
  classBackgroundSkills: SkillName[],
): CreationSpeciesSkillChoice {
  const spec: SpeciesSkillChoiceOption | null = selections.species?.chooseSkills ?? selections.variant?.chooseSkills ?? null;
  if (!spec) return { applicable: false, count: 0, options: [], selected: [], complete: true };

  const eligible = spec.from ? SKILL_OPTIONS.filter((o) => spec.from!.includes(o.key)) : SKILL_OPTIONS;
  const options = eligible.filter((o) => !classBackgroundSkills.includes(o.key));
  const selected = draft.speciesSkills.filter((s) => options.some((o) => o.key === s));
  return { applicable: true, count: spec.count, options, selected, complete: selected.length === spec.count };
}

export interface CreationSpeciesCantripChoice {
  /** False renders no panel — same server-spec-driven shape as the skill
   *  choice above. */
  applicable: boolean;
  /** Lowercase class name the cantrip must come from — forwarded to
   *  `GET /api/spells?className=` unchanged, the SAME server-filtering seam
   *  (#1377/#1572) the class's own creation-spells step already uses. */
  list: string;
  castingAbility: AbilityName;
  selectedId: string;
  complete: boolean;
}

// Derives the species cantrip-choice state for the form (#1689, High Elf's
// Cantrip). Unlike the skill choice above, this is independent of the
// character's own class — a non-caster class still needs the picker (a High
// Elf Fighter gets the cantrip too), which is why `creationSteps` (#1689)
// adds the spells step for THIS reason alone even when `level1SpellPicks` is
// null.
export function deriveSpeciesCantripChoice(
  draft: CharacterDraft,
  selections: CreationSelections,
): CreationSpeciesCantripChoice {
  const spec: SpeciesCantripChoiceOption | null = selections.species?.chooseCantrip ?? selections.variant?.chooseCantrip ?? null;
  if (!spec) return { applicable: false, list: "", castingAbility: "intelligence", selectedId: "", complete: true };
  return {
    applicable: true,
    list: spec.list,
    castingAbility: spec.castingAbility,
    selectedId: draft.speciesCantripId,
    complete: draft.speciesCantripId.length > 0,
  };
}

export interface CreationSpeciesOriginFeatChoice {
  /** False renders no panel — driven purely by the served chooseOriginFeat
   *  boolean (#1572 trick), never a client edition check. */
  applicable: boolean;
  selectedId: string;
  complete: boolean;
}

// Derives the species Origin-feat-choice state for the form (#1690, 2024
// Human's Versatile). Unlike the skill/cantrip choices above there is no
// further spec to resolve here — chooseOriginFeat is a bare boolean, and
// "Origin category" is enforced server-side against the live Feat catalog
// (resolveSpeciesOriginFeatGrant), never a client-side filter of a fixed list.
export function deriveSpeciesOriginFeatChoice(
  draft: CharacterDraft,
  selections: CreationSelections,
): CreationSpeciesOriginFeatChoice {
  const applicable = Boolean(selections.species?.chooseOriginFeat || selections.variant?.chooseOriginFeat);
  if (!applicable) return { applicable: false, selectedId: "", complete: true };
  return { applicable: true, selectedId: draft.speciesOriginFeatId, complete: draft.speciesOriginFeatId.length > 0 };
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

// Only a COMPLETED choice is ever sent — an incomplete or inert one sends
// undefined, same "the backend 400s a field it didn't ask for" shape as
// speciesAbilities. Split out purely to keep buildCreatePayload's own
// cyclomatic/cognitive complexity under the repo's health gate; each of
// these three collapses one ternary out of that function's own body.
function completedSpeciesAbilities(bonuses: CreationSpeciesBonuses): Partial<Record<AbilityName, number>> | undefined {
  return bonuses.choice && bonuses.complete ? bonuses.assignment : undefined;
}
function completedSpeciesSkills(choice: CreationSpeciesSkillChoice): SkillName[] | undefined {
  return choice.applicable && choice.complete ? choice.selected : undefined;
}
function completedSpeciesCantripId(choice: CreationSpeciesCantripChoice): string | undefined {
  return choice.applicable && choice.complete ? choice.selectedId : undefined;
}
function completedSpeciesOriginFeatId(choice: CreationSpeciesOriginFeatChoice): string | undefined {
  return choice.applicable && choice.complete ? choice.selectedId : undefined;
}

// #1131/#1689: a level-1 caster's own creation picks — a species cantrip
// choice rides the SAME `spells` step but a DIFFERENT request field
// (speciesCantripId above), so a non-caster class with one omits this
// entirely while still sending that field.
function creationSpellsField(
  selections: CreationSelections,
  draft: CharacterDraft,
): { spells: { cantripIds: string[]; spellIds: string[] } } | Record<string, never> {
  return selections.class?.level1SpellPicks
    ? { spells: { cantripIds: draft.cantripIds, spellIds: draft.spellIds } }
    : {};
}

export function buildCreatePayload(
  draft: CharacterDraft,
  selections: CreationSelections,
  skills: CreationSkillChoices,
  selectedToolChoices: string[]
): CreateCharacterInput {
  const backgroundBonuses = deriveBackgroundBonuses(draft, selections);
  const speciesBonuses = deriveSpeciesBonuses(draft, selections);
  const classBackgroundSkills = [...skills.granted, ...skills.selected];
  // #1689: species creation choices, independent of the #1681 ability spread
  // above — a species may carry both (Half-Elf: CHA+2/choose-two AND Skill
  // Versatility) in the same request.
  const speciesSkillChoice = deriveSpeciesSkillChoice(draft, selections, classBackgroundSkills);
  const speciesCantripChoice = deriveSpeciesCantripChoice(draft, selections);
  const speciesOriginFeatChoice = deriveSpeciesOriginFeatChoice(draft, selections);
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
    speciesAbilities: completedSpeciesAbilities(speciesBonuses),
    speciesSkills: completedSpeciesSkills(speciesSkillChoice),
    speciesCantripId: completedSpeciesCantripId(speciesCantripChoice),
    speciesOriginFeatId: completedSpeciesOriginFeatId(speciesOriginFeatChoice),
    background: resolveBackgroundName(draft),
    classes: [{
      name: draft.className,
      subclass: draft.subclass.trim() || null,
      subclassId: draft.subclassId || undefined,
    }],
    abilityScores: draft.abilityScores,
    // Only send a complete spread; the backend derives HP/init from it (#1130).
    backgroundAbilities: backgroundBonuses.complete ? backgroundBonuses.assignment : undefined,
    skillProficiencies: classBackgroundSkills,
    toolChoices: selectedToolChoices.length > 0 ? selectedToolChoices : undefined,
    startingEquipment: resolveEquipmentInput(draft, selections.class) ?? undefined,
    backgroundStartingEquipment: resolveBackgroundEquipmentInput(draft, selections.background) ?? undefined,
    ...creationSpellsField(selections, draft),
    // #1286: resolved by CreationEntryGate before the ceremony is reachable, so
    // this is always set by the time a real submit happens (never a silent default).
    rulesEdition: draft.rulesEdition ?? undefined,
  };
}
