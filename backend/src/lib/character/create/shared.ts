import type { Prisma } from "@/generated/prisma/client.js";
import type { prisma } from "@/lib/core/prisma.js";
import { ABILITY_CAP } from "@/lib/leveling/advancement.js";
import { MANUAL_SCORE_CEILING } from "@/lib/srd/ability-generation.js";
import type { AdvancementEntry } from "@/lib/classes/resources.js";
import type { buildInventoryCreateFromCatalog } from "@/lib/inventory/inventory.js";
import type { ChooseCantrip, ChooseSkills } from "@/lib/srd/species-trait-choices.js";
import type { AbilityGenerationMethod, ClassStartingEquipment, RulesEdition } from "@character-sheet/shared-types";
import type { CreateCharacterBody } from "@/lib/character/character-schemas.js";

export type Fail = { ok: false; status: 400; error: string };
type Ok<T> = { ok: true } & T;
export type PhaseResult<T> = Fail | Ok<T>;

export type PrimaryClassChoice = CreateCharacterBody["classes"][number];
export type ResolvedClass = NonNullable<Awaited<ReturnType<typeof prisma.characterClass.findUnique>>>;
export type ResolvedBackground = Prisma.BackgroundGetPayload<{ include: { originFeat: true } }> | null;

export type BackgroundGrants = {
  effectiveScores: Record<string, number>;
  originEntry: AdvancementEntry | null;
};

export type CreationToolProf = { name: string; source: "background" | "class" };
export type PackageEquipment = Extract<
  NonNullable<CreateCharacterBody["startingEquipment"]>,
  { mode: "package" }
>;
export type ClassEquipmentDef = ClassStartingEquipment;
export type InventoryCreate = ReturnType<typeof buildInventoryCreateFromCatalog>;

export type ResolvedSelections = {
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

export type SpeciesSelection = {
  speciesId: string;
  speciesName: string;
  variantId: string | null;
  variantName: string | null;
  // Variant speedOverride wins over the species' own speed.
  speed: number;
};

export type MaterializedEquipment = {
  inventoryItemCreates: InventoryCreate[];
  startingCurrency?: { cp: number; sp: number; gp: number; pp: number };
};

export type SpeciesChoiceSpecs = {
  chooseSkills: ChooseSkills | null;
  chooseCantrip: ChooseCantrip | null;
  chooseOriginFeat: boolean;
};

export type SpeciesGrants = {
  effectiveScores: Record<string, number>;
  appliedIncreases: { ability: string; amount: number }[];
};

// PHB'14 p.13 "the highest that an ability score can normally be raised to is 20" / SRD 5.2
// background-increase step, "none of these increases can raise a score above 20" — the post-bonus
// cap for standardArray/pointBuy. manual/roll/omitted have no fixed baseline to reason from, so
// they fall back to MANUAL_SCORE_CEILING, the same pre-bonus sanity bound validateAbilityScores uses.
export function postBonusAbilityCap(method: AbilityGenerationMethod | undefined): number {
  switch (method) {
    case "standardArray":
    case "pointBuy":
      return ABILITY_CAP;
    case "roll":
    case "manual":
    case undefined:
      return MANUAL_SCORE_CEILING;
    default: {
      const exhaustive: never = method;
      throw new Error(`postBonusAbilityCap: unhandled method ${String(exhaustive)}`);
    }
  }
}

export function abilityCapOverflowError(
  entries: [string, number][],
  base: Record<string, number>,
  fieldName: string,
  method: AbilityGenerationMethod | undefined,
): Fail | null {
  const cap = postBonusAbilityCap(method);
  const over = entries.find(([ability, amount]) => (base[ability] ?? 10) + amount > cap);
  if (!over) return null;
  return { ok: false, status: 400, error: `${fieldName}: ${over[0]} would exceed ${cap}` };
}
