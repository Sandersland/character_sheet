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
  ReferenceData,
  SkillName,
  SpeciesCantripChoiceOption,
  SpeciesOption,
  SpeciesSkillChoiceOption,
  SpeciesVariantOption,
  StartingEquipmentInput,
} from "@/types/character";

export interface CreationSelections {
  // The sole species/variant source of truth — the flat Race catalog was pruned (#1684).
  species: SpeciesOption | undefined;
  variant: SpeciesVariantOption | undefined;
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
  applicable: boolean;
  abilities: AbilityName[];
  originFeat: OriginFeatOption | null;
  assignment: Partial<Record<AbilityName, number>>;
  complete: boolean;
}

// A legal PHB'24 spread is +2/+1 (two abilities) or +1/+1/+1 (three) — sums to 3.
function isValidSpread(values: number[]): boolean {
  const sorted = [...values].sort((a, b) => a - b);
  const isTwoOne = sorted.length === 2 && sorted[0] === 1 && sorted[1] === 2;
  const isOneOneOne = sorted.length === 3 && sorted.every((v) => v === 1);
  return isTwoOne || isOneOneOne;
}

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

// Inert (applicable:false) for a custom or spec-less (Folk Hero) background (#1130).
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

// choose = pick count distinct abilities at +amount each (Half-Elf); floating = assign a points pool as +2/+1 or +1/+1/+1 (Astral Elf) (#1758).
export type SpeciesAbilityChoice =
  | { kind: "choose"; count: number; amount: number; abilities: AbilityName[] }
  | { kind: "floating"; points: number; abilities: AbilityName[] };

export interface CreationSpeciesBonuses {
  // False for every 2024 species (spec is always []), matching the backend's #1681 gate.
  applicable: boolean;
  fixed: Partial<Record<AbilityName, number>>;
  // Only the first spec is used; choose wins over floating if a row ever carries both, mirroring the backend's resolveChosenIncreases priority.
  choice: SpeciesAbilityChoice | null;
  assignment: Partial<Record<AbilityName, number>>;
  complete: boolean;
}

// Mirrors the backend's floatingSpreadShapeValid purely to drive the form — the create endpoint re-validates (#1758).
function isValidFloatingSpread(assignment: Partial<Record<AbilityName, number>>): boolean {
  return isValidSpread(Object.values(assignment));
}

// Mirrors resolveSpeciesGrants/resolveChosenIncreases in character-create.ts — eligible abilities exclude anything already fixed, and choose wins over floating.
function splitSpeciesIncreases(specs: AbilityIncreaseSpec[]): {
  fixed: Partial<Record<AbilityName, number>>;
  choice: SpeciesAbilityChoice | null;
} {
  const fixed: Partial<Record<AbilityName, number>> = {};
  const chooseSpecs: NonNullable<Extract<AbilityIncreaseSpec, { choose: unknown }>>["choose"][] = [];
  const floatingSpecs: number[] = [];
  for (const spec of specs) {
    if ("ability" in spec) {
      fixed[spec.ability] = (fixed[spec.ability] ?? 0) + spec.amount;
    } else if ("choose" in spec) {
      chooseSpecs.push(spec.choose);
    } else {
      floatingSpecs.push(spec.floating);
    }
  }
  const eligible = (from?: AbilityName[]) => (from ?? [...ABILITY_ORDER]).filter((a) => fixed[a] === undefined);
  const firstChoose = chooseSpecs[0];
  let choice: SpeciesAbilityChoice | null = null;
  if (firstChoose) {
    choice = { kind: "choose", count: firstChoose.count, amount: firstChoose.amount, abilities: eligible(firstChoose.from) };
  } else if (floatingSpecs.length > 0) {
    choice = { kind: "floating", points: floatingSpecs[0], abilities: eligible() };
  }
  return { fixed, choice };
}

// Distinctness is free — a Record's keys are already unique.
function speciesChoiceComplete(choice: SpeciesAbilityChoice, assignment: Partial<Record<AbilityName, number>>): boolean {
  if (choice.kind === "floating") return isValidFloatingSpread(assignment);
  return Object.keys(assignment).length === choice.count && Object.values(assignment).every((v) => v === choice.amount);
}

// Inert (applicable:false) when the merged spec is empty — every 2024 species, or an unmatched species/variant.
export function deriveSpeciesBonuses(
  draft: CharacterDraft,
  selections: CreationSelections,
): CreationSpeciesBonuses {
  // A replacing variant supplies the entire spec (base species increases dropped, not stacked) — mirrors the backend's fetchMergedAbilityIncreases (#1758).
  const variantIncreases = selections.variant?.abilityIncreases ?? [];
  const specs = selections.variant?.abilityIncreasesReplace
    ? variantIncreases
    : [...(selections.species?.abilityIncreases ?? []), ...variantIncreases];
  const { fixed, choice } = splitSpeciesIncreases(specs);
  const applicable = Object.keys(fixed).length > 0 || choice !== null;
  const assignment = choice ? pickAssignment(draft.speciesAbilities, choice.abilities) : {};
  const complete = !choice || speciesChoiceComplete(choice, assignment);
  return { applicable, fixed, choice, assignment, complete };
}

export interface CreationCastingAbilityChoice {
  // Server-served needsCastingAbility flag — never re-derived client-side.
  applicable: boolean;
  value: "" | "intelligence" | "wisdom" | "charisma";
  complete: boolean;
}

// Variant's flag wins when a variant is chosen (mirrors deriveSpeciesBonuses' merge precedent), else falls back to the species' own flag (#1683).
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

export interface CreationSpeciesSkillChoice {
  // Driven purely by the served spec, never a client edition check (#1572).
  applicable: boolean;
  count: number;
  // Excludes class/background-granted skills — a species pick may not duplicate those (server-enforced; keeps the picker from ever offering a 400).
  options: { key: SkillName; label: string }[];
  selected: SkillName[];
  complete: boolean;
}

// Only one of species-level/variant-level chooseSkills is ever populated this wave (#1689).
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
  applicable: boolean;
  // Forwarded to GET /api/spells?className= unchanged — the same server-filtering seam the class's own creation-spells step uses. Mutually exclusive with spells (#1756).
  list?: string;
  // Explicit cantrip names to filter the picker's fetched list to (#1756).
  spells?: string[];
  // undefined = player picks via the identity step's Int/Wis/Cha control; set = a fixed ability (#1756).
  castingAbility?: AbilityName;
  selectedId: string;
  complete: boolean;
}

// Independent of the character's class — a non-caster still needs the picker (a High Elf Fighter gets the cantrip too); forwards the server spec verbatim, never a client rule.
export function deriveSpeciesCantripChoice(
  draft: CharacterDraft,
  selections: CreationSelections,
): CreationSpeciesCantripChoice {
  const spec: SpeciesCantripChoiceOption | null = selections.species?.chooseCantrip ?? selections.variant?.chooseCantrip ?? null;
  if (!spec) return { applicable: false, selectedId: "", complete: true };
  return {
    applicable: true,
    list: spec.list,
    spells: spec.spells,
    castingAbility: spec.castingAbility,
    selectedId: draft.speciesCantripId,
    complete: draft.speciesCantripId.length > 0,
  };
}

export interface CreationSpeciesOriginFeatChoice {
  // Driven purely by the served chooseOriginFeat boolean, never a client edition check (#1572).
  applicable: boolean;
  selectedId: string;
  complete: boolean;
}

// "Origin category" is enforced server-side against the live Feat catalog (resolveSpeciesOriginFeatGrant), never a client-side filter (#1690).
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

// species/variant resolve by id (like subclassId); class/background resolve by name (#1680).
export function resolveSelections(
  reference: ReferenceData | null,
  draft: CharacterDraft
): CreationSelections {
  const species = reference?.species.find((s) => s.id === draft.speciesId);
  const variant = species?.variants.find((v) => v.id === draft.variantId);
  return {
    species,
    variant,
    class: reference?.classes.find((c) => c.name === draft.className),
    background: reference?.backgrounds.find((b) => b.name === draft.background),
  };
}

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

export function resolveBackgroundName(draft: CharacterDraft): string {
  return draft.useCustomBackground ? draft.customBackground.trim() : draft.background;
}

export function resolveEquipmentInput(
  draft: CharacterDraft,
  selectedClass: ClassOption | undefined
): StartingEquipmentInput | undefined {
  if (!draft.equipmentDraft || !selectedClass?.startingEquipment) return undefined;
  return draftToInput(selectedClass.startingEquipment, draft.equipmentDraft) ?? undefined;
}

// Mirrors resolveEquipmentInput for the background's own package (#1565).
export function resolveBackgroundEquipmentInput(
  draft: CharacterDraft,
  selectedBackground: BackgroundOption | undefined
): StartingEquipmentInput | undefined {
  if (!draft.backgroundEquipmentDraft || !selectedBackground?.startingEquipment) return undefined;
  return draftToInput(selectedBackground.startingEquipment, draft.backgroundEquipmentDraft) ?? undefined;
}

// Background and species assignments never both contribute in practice (opposite-edition mechanics) — folding both unconditionally avoids an edition branch here (#1130/#1681).
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
    // species.speed is the edition-accurate value GET /api/reference serves — not the legacy race-catalog match (#1680).
    speed: selections.species?.speed,
    maxHp: selections.class
      ? Math.max(1, hitDieFace(selections.class.hitDie) + conModifier)
      : undefined,
  };
}

// Only a completed choice is ever sent — incomplete/inert sends undefined, since the backend 400s a field it didn't ask for.
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
function completedCastingAbility(choice: CreationCastingAbilityChoice): "intelligence" | "wisdom" | "charisma" | undefined {
  return choice.applicable && choice.value ? choice.value : undefined;
}

// Species cantrip choice rides the same spells step but a different request field (speciesCantripId) — a non-caster omits this while still sending that (#1131/#1689).
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
  selectedToolChoices: string[],
  // Independent of selectedToolChoices (the class's); defaulted so pre-#1779 call sites still compile (#1779).
  selectedBackgroundToolChoices: string[] = []
): CreateCharacterInput {
  const backgroundBonuses = deriveBackgroundBonuses(draft, selections);
  const speciesBonuses = deriveSpeciesBonuses(draft, selections);
  const castingAbilityChoice = deriveCastingAbilityChoice(draft, selections);
  const classBackgroundSkills = [...skills.granted, ...skills.selected];
  // Independent of the ability spread above — a species may carry both in the same request (e.g. Half-Elf) (#1689).
  const speciesSkillChoice = deriveSpeciesSkillChoice(draft, selections, classBackgroundSkills);
  const speciesCantripChoice = deriveSpeciesCantripChoice(draft, selections);
  const speciesOriginFeatChoice = deriveSpeciesOriginFeatChoice(draft, selections);
  return {
    name: draft.name.trim(),
    alignment: draft.alignment,
    // The sole mechanical anchor — the flat race field and its legacy create path are gone; always set by submit time (same guarantee rulesEdition below relies on) (#1684).
    speciesId: draft.speciesId,
    variantId: draft.variantId || undefined,
    // Only sent when the choice is completed — a fixed-only species sends undefined; the backend 400s a speciesAbilities it didn't ask for (#1681).
    speciesAbilities: completedSpeciesAbilities(speciesBonuses),
    // Only sent when completed — the backend 400s a castingAbility it didn't ask for (resolveCastingAbility, character-create.ts) (#1683).
    castingAbility: completedCastingAbility(castingAbilityChoice),
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
    backgroundToolChoices:
      selectedBackgroundToolChoices.length > 0 ? selectedBackgroundToolChoices : undefined,
    startingEquipment: resolveEquipmentInput(draft, selections.class) ?? undefined,
    backgroundStartingEquipment: resolveBackgroundEquipmentInput(draft, selections.background) ?? undefined,
    ...creationSpellsField(selections, draft),
    // Resolved by CreationEntryGate before the ceremony is reachable — always set by submit time, never a silent default (#1286).
    rulesEdition: draft.rulesEdition ?? undefined,
  };
}
