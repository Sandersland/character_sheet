import type { Prisma } from "@/generated/prisma/client.js";
import type { prisma } from "@/lib/core/prisma.js";
import { ABILITY_CAP } from "@/lib/leveling/advancement.js";
import type { AdvancementEntry } from "@/lib/classes/resources.js";
import type { buildInventoryCreateFromCatalog } from "@/lib/inventory/inventory.js";
import type { ChooseCantrip, ChooseSkills } from "@/lib/srd/species-trait-choices.js";
import type { ClassStartingEquipment, RulesEdition } from "@character-sheet/shared-types";
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

export function abilityCapOverflowError(
  entries: [string, number][],
  base: Record<string, number>,
  fieldName: string,
): Fail | null {
  const over = entries.find(([ability, amount]) => (base[ability] ?? 10) + amount > ABILITY_CAP);
  if (!over) return null;
  return { ok: false, status: 400, error: `${fieldName}: ${over[0]} would exceed ${ABILITY_CAP}` };
}
