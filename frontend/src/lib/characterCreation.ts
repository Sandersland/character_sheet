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
  /** #1680: the two-step picker's own selection — the sole species/variant
   *  source of truth since #1684 pruned the flat `Race` catalog. */
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

/** The interactive species ability-increase choice, one of two shapes (#1758):
 *  - `choose`: pick exactly `count` distinct abilities, +`amount` each
 *    (Half-Elf's "+1 to two of your choice").
 *  - `floating`: assign a `points` pool as +2/+1 (two abilities) or +1/+1/+1
 *    (three) across distinct abilities (Astral Elf's Tasha's-era spread).
 *  `abilities` is the eligible set in both — every ability not already fixed. */
export type SpeciesAbilityChoice =
  | { kind: "choose"; count: number; amount: number; abilities: AbilityName[] }
  | { kind: "floating"; points: number; abilities: AbilityName[] };

export interface CreationSpeciesBonuses {
  /** True when the matched species+variant's merged spec carries a fixed
   *  increase, a choice, or both. False renders no panel — 2024 always false
   *  (every 2024 row's spec is []), matching #1681's backend gate. */
  applicable: boolean;
  /** Fixed increases, auto-applied server-side — already summed across
   *  species + variant (Hill Dwarf: {constitution: 2, wisdom: 1}). */
  fixed: Partial<Record<AbilityName, number>>;
  /** The interactive requirement (choose or floating), or null when the merged
   *  spec has neither. Only the FIRST such spec is supported — no roster row
   *  seeds more than one, and choose wins over floating if a future row ever
   *  carries both (mirrors backend resolveChosenIncreases' priority). */
  choice: SpeciesAbilityChoice | null;
  /** Current assignment, restricted to the choice's eligible abilities. */
  assignment: Partial<Record<AbilityName, number>>;
  /** True when there's no choice to make, or the assignment satisfies it. */
  complete: boolean;
}

// A legal floating spread is +2/+1 (two abilities) or +1/+1/+1 (three) — the
// SAME shape isValidSpread checks for the background spread. Mirrors the
// backend floatingSpreadShapeValid (lib/rules/background-grants.ts) purely to
// drive the form; the create endpoint re-validates (#1758).
function isValidFloatingSpread(assignment: Partial<Record<AbilityName, number>>): boolean {
  return isValidSpread(Object.values(assignment));
}

// Splits a merged species+variant abilityIncreases spec array into its fixed
// spread (summed per ability) and its first interactive spec — a choose
// (Half-Elf) or a floating pool (Astral Elf, #1758). Eligible abilities are
// narrowed to exclude anything already fixed, and choose wins over floating,
// both mirroring resolveSpeciesGrants/resolveChosenIncreases in
// character-create.ts.
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

// True when the assignment satisfies the choice — a floating spread must be a
// legal +2/+1-or-+1/+1/+1 shape, a choose must be exactly `count` distinct
// abilities at `amount` each. Distinctness is free (a Record's keys are unique).
function speciesChoiceComplete(choice: SpeciesAbilityChoice, assignment: Partial<Record<AbilityName, number>>): boolean {
  if (choice.kind === "floating") return isValidFloatingSpread(assignment);
  return Object.keys(assignment).length === choice.count && Object.values(assignment).every((v) => v === choice.amount);
}

// Derives the species ability-increase state for the form: the auto-applied
// fixed bumps, the choose requirement (if any), the current assignment, and
// whether it's complete. Inert (applicable:false) for a variantless/unmatched
// race name or a species whose merged spec is empty (every 2024 species).
export function deriveSpeciesBonuses(
  draft: CharacterDraft,
  selections: CreationSelections,
): CreationSpeciesBonuses {
  // #1758: a replacing variant (Astral Elf) supplies the ENTIRE spec — the base
  // species' increases are dropped, not stacked — mirroring the backend's
  // fetchMergedAbilityIncreases; every real subrace leaves the flag false and
  // stacks additively.
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
  /** #1756: lowercase class name the cantrip must come from (High Elf) —
   *  forwarded to `GET /api/spells?className=` unchanged, the SAME
   *  server-filtering seam (#1377/#1572) the class's own creation-spells step
   *  uses. Mutually exclusive with `spells`. */
  list?: string;
  /** #1756: explicit cantrip NAMES the pick is narrowed to (Astral Fire) —
   *  the picker fetches all cantrips and filters to these. */
  spells?: string[];
  /** #1756: undefined = the player picks the ability via the identity step's
   *  Int/Wis/Cha control (Astral Fire); set = a fixed ability (High Elf's
   *  Intelligence) named in this panel's copy. */
  castingAbility?: AbilityName;
  selectedId: string;
  complete: boolean;
}

// Derives the species cantrip-choice state for the form (#1689 High Elf, #1756
// Astral Fire). Unlike the skill choice above, this is independent of the
// character's own class — a non-caster class still needs the picker (a High
// Elf Fighter gets the cantrip too), which is why `creationSteps` (#1689)
// adds the spells step for THIS reason alone even when `level1SpellPicks` is
// null. Forwards the server-resolved spec verbatim (list/spells/castingAbility
// are all narrowing display, never a client rule).
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
function completedCastingAbility(choice: CreationCastingAbilityChoice): "intelligence" | "wisdom" | "charisma" | undefined {
  return choice.applicable && choice.value ? choice.value : undefined;
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
  selectedToolChoices: string[],
  // #1779: the background's own pick, independent of selectedToolChoices
  // above (the class's) — defaulted so every pre-#1779 call site (none of
  // which knows about a background pick) still compiles unchanged.
  selectedBackgroundToolChoices: string[] = []
): CreateCharacterInput {
  const backgroundBonuses = deriveBackgroundBonuses(draft, selections);
  const speciesBonuses = deriveSpeciesBonuses(draft, selections);
  const castingAbilityChoice = deriveCastingAbilityChoice(draft, selections);
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
    // #1684: speciesId is the sole mechanical anchor (the flat `race` field
    // and its legacy create path are gone) — always set by submit time, the
    // same "gated by CreationCeremony's step validity" guarantee `rulesEdition`
    // below relies on.
    speciesId: draft.speciesId,
    variantId: draft.variantId || undefined,
    // Only send a completed CHOICE; a fixed-only species (or none) sends
    // undefined — the backend applies fixed increases unconditionally with no
    // request field and 400s a speciesAbilities it didn't ask for (#1681).
    speciesAbilities: completedSpeciesAbilities(speciesBonuses),
    // #1683: only send a completed choice; a species/variant that grants no
    // spell (or an unanswered choice) sends undefined — the backend 400s a
    // castingAbility it didn't ask for (resolveCastingAbility, character-create.ts).
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
    // #1286: resolved by CreationEntryGate before the ceremony is reachable, so
    // this is always set by the time a real submit happens (never a silent default).
    rulesEdition: draft.rulesEdition ?? undefined,
  };
}
