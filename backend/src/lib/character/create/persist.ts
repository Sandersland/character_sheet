import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { stripInventoryCreateForWrite } from "@/lib/inventory/inventory.js";
import { deriveCreatedCharacter, derivePreparedSpellLimit } from "@/lib/srd/srd.js";
import {
  normalizeResourcesMutable,
  serializeResourcesState,
  type AdvancementEntry,
} from "@/lib/classes/resources.js";
import { clampPreparedToLimit, type SpellEntry } from "@/lib/spellcasting/spell-state.js";
import { DEFAULT_RULES_EDITION } from "@/lib/rules/edition.js";
import type { CreateCharacterBody } from "@/lib/character/character-schemas.js";
import type {
  BackgroundGrants,
  InventoryCreate,
  MaterializedEquipment,
  PrimaryClassChoice,
  ResolvedSelections,
  SpeciesGrants,
} from "./shared.js";

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

export type CreationMaterials = {
  input: CreateCharacterBody;
  ownerId: string;
  selections: ResolvedSelections;
  equipment: MaterializedEquipment;
  spellEntries: SpellEntry[] | null;
  grants: BackgroundGrants;
  speciesGrants: SpeciesGrants;
  speciesOriginFeatEntry: AdvancementEntry | null;
  castingAbility: string | null;
};

export async function persistCreatedCharacter(materials: CreationMaterials): Promise<{ id: string }> {
  const {
    input,
    ownerId,
    selections,
    equipment,
    spellEntries,
    grants,
    speciesGrants,
    speciesOriginFeatEntry,
    castingAbility,
  } = materials;
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
