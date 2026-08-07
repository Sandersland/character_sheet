import { randomUUID } from "node:crypto";

import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import {
  autoEquipSlot,
  buildInventoryCreateFromCatalog,
  catalogItemDetailInclude,
  selectAutoEquip,
  stripInventoryCreateForWrite,
} from "@/lib/inventory/inventory.js";
import {
  ALIGNMENTS,
  deriveCreatedCharacter,
  derivePreparedSpellLimit,
  isKnownTool,
  level1SpellPicksFor,
  maxSpellLevelForClass,
  SKILLS,
} from "@/lib/srd/srd.js";
import { ABILITY_CAP } from "@/lib/leveling/advancement.js";
import {
  normalizeResourcesMutable,
  serializeResourcesState,
  type AdvancementEntry,
  type FeatImprovement,
} from "@/lib/classes/resources.js";
import {
  mapStartingEquipmentPackage,
  EQUIPMENT_PACKAGE_INCLUDE,
} from "@/lib/inventory/starting-equipment-package.js";
import { creationSpellEntry } from "@/lib/spellcasting/spellcasting.js";
import { clampPreparedToLimit, type SpellEntry } from "@/lib/spellcasting/spell-state.js";
import { classesOf, rejectCrossEditionSpellForks, SPELL_CLASS_MEMBERSHIP_SELECT } from "@/lib/spellcasting/spell-classes.js";
import { loadSubclassSpellListExpansionIds } from "@/lib/spellcasting/spell-list-expansion.js";
import { subclassGateLevel } from "@/lib/leveling/effective-levels.js";
import { DEFAULT_RULES_EDITION } from "@/lib/rules/edition.js";
import { crossEditionRejection, resolveEditionRow, withEditionOrShared } from "@/lib/rules/catalog-edition.js";
import {
  applyAbilitySpread,
  backgroundGrantsAbilitySpread,
  backgroundGrantsOriginFeat,
  floatingSpreadShapeValid,
  speciesGrantsAbilityIncreases,
} from "@/lib/rules/background-grants.js";
import {
  ABILITY_NAMES,
  type AbilityIncreaseSpec,
  type ChooseIncrease,
} from "@/lib/srd/species-ability-increases.js";
import {
  chooseCantripNeedsPlayerAbility,
  isChooseCantrip,
  isChooseOriginFeat,
  isChooseSkills,
  type ChooseCantrip,
  type ChooseSkills,
  type SpeciesTraitChoice,
} from "@/lib/srd/species-trait-choices.js";
import type { ClassStartingEquipment, RulesEdition } from "@character-sheet/shared-types";
import type { CreateCharacterBody } from "./character-schemas.js";

// Discriminated result: return just the new id so the route re-fetches by id
// with characterInclude and serializes (persist-then-reserialize idiom).
export type CreateCharacterResult =
  | { ok: true; id: string }
  | { ok: false; status: 400; error: string };

// Internal phase-helper result: a 400 failure or the phase's success payload.
type Fail = { ok: false; status: 400; error: string };
type Ok<T> = { ok: true } & T;
type PhaseResult<T> = Fail | Ok<T>;

type PrimaryClassChoice = CreateCharacterBody["classes"][number];
type ResolvedClass = NonNullable<Awaited<ReturnType<typeof prisma.characterClass.findUnique>>>;
type ResolvedBackground = Prisma.BackgroundGetPayload<{ include: { originFeat: true } }> | null;

// Background grants resolved from the request: the ability spread already folded
// into effective scores (baked before deriveCreatedCharacter, #1130 D2) and the
// Origin feat as a slot-exempt AdvancementEntry (null when the background has none).
type BackgroundGrants = {
  effectiveScores: Record<string, number>;
  originEntry: AdvancementEntry | null;
};

// Magic Initiate is one repeatable catalog row shared by two backgrounds; the
// class it grants spells from is a creation-time snapshot, not a column (#1130).
const MAGIC_INITIATE_CLASS_BY_BACKGROUND: Record<string, string> = {
  Acolyte: "Cleric",
  Sage: "Wizard",
};
type CreationToolProf = { name: string; source: "background" | "class" };
type PackageEquipment = Extract<
  NonNullable<CreateCharacterBody["startingEquipment"]>,
  { mode: "package" }
>;
type ClassEquipmentDef = ClassStartingEquipment;
type InventoryCreate = ReturnType<typeof buildInventoryCreateFromCatalog>;

type ResolvedSelections = {
  primaryClassChoice: PrimaryClassChoice;
  characterClass: ResolvedClass;
  background: ResolvedBackground;
  subclassId: string | null;
  subclassName: string | null;
  skillProficiencies: string[];
  creationToolProfs: CreationToolProf[];
  // #1507/#1510: threaded through to creationSpellCountError's level1SpellPicksFor
  // call and resolveCreationSpells' maxSpellLevelForClass ceiling. Recomputed
  // here (not re-derived from input.rulesEdition ?? DEFAULT_RULES_EDITION a
  // second time) since resolveSelections already resolved it for the
  // creation-time subclass gate.
  edition: RulesEdition;
  // #1679/#1684: the validated species/variant selection — the sole
  // mechanical anchor since the flat Race model was pruned. #1681's
  // resolveSpeciesGrants resolves this into a SpeciesGrants (ability increases
  // baked into effective scores + the applied-increases provenance snapshot);
  // persistCreatedCharacter writes the selection + variantName + abilityBonuses
  // onto CharacterRace.
  speciesSelection: SpeciesSelection;
  // #1689: the confirmed species/variant's own choice-bearing trait specs
  // (SpeciesTrait.choice) — { null, null } for a species with no
  // choice-bearing trait (every 2024 species this slice).
  // resolveSpeciesSkillGrant/resolveSpeciesCantripGrant read this to
  // validate + apply speciesSkills/speciesCantripId.
  speciesChoiceSpecs: SpeciesChoiceSpecs;
};

// #1679/#1684: the validated species/variant selection persisted onto
// CharacterRace, sibling to subclassId/subclassName above — the sole
// mechanical anchor (speed + display name) since the flat Race model's prune.
type SpeciesSelection = {
  speciesId: string;
  speciesName: string;
  variantId: string | null;
  variantName: string | null;
  // Variant speedOverride wins, else the parent species' own speed —
  // deriveCreatedCharacter's replacement for the pruned Race.speed anchor.
  speed: number;
};

type MaterializedEquipment = {
  inventoryItemCreates: InventoryCreate[];
  startingCurrency?: { cp: number; sp: number; gp: number; pp: number };
};

// Resolves a list of FixedItemRef-style catalog names + quantities into
// InventoryItem nested-create payloads. Expands pack names via PACK_CONTENTS.
// Fetches all required catalog Items in one query (by name) and returns an
// `error` string if any name is unknown, so the caller can return a 400.
async function resolveFixedItems(
  refs: { catalogName: string; quantity?: number }[]
): Promise<{ inventoryCreates: InventoryCreate[]; error?: string }> {
  // Expand packs via DB — fetch all Pack rows whose name matches a ref.
  const refNames = [...new Set(refs.map((r) => r.catalogName))];
  const packs = await prisma.pack.findMany({
    where: { name: { in: refNames } },
    include: { contents: { include: { item: { select: { name: true } } } } },
  });
  const packByName = new Map(packs.map((p) => [p.name, p]));

  const expanded: { catalogName: string; quantity: number }[] = [];
  for (const ref of refs) {
    const pack = packByName.get(ref.catalogName);
    if (pack) {
      for (const content of pack.contents) {
        expanded.push({ catalogName: content.item.name, quantity: content.quantity * (ref.quantity ?? 1) });
      }
    } else {
      expanded.push({ catalogName: ref.catalogName, quantity: ref.quantity ?? 1 });
    }
  }

  const names = [...new Set(expanded.map((r) => r.catalogName))];
  const items = await prisma.item.findMany({
    // Pinned to the GLOBAL catalog (#1645), same rule as validateOpenPick.
    // itemByName below collapses this on name, so an unpinned read would let a
    // campaign row OVERWRITE the catalog one and grant the wrong item entirely.
    where: { scopeKey: "global", name: { in: names } },
    include: catalogItemDetailInclude,
  });
  const itemByName = new Map(items.map((i) => [i.name, i]));

  const missing = names.filter((n) => !itemByName.has(n));
  if (missing.length > 0) {
    return { inventoryCreates: [], error: `Unknown catalog items: ${missing.join(", ")}` };
  }

  const inventoryCreates = expanded.map((ref, idx) =>
    buildInventoryCreateFromCatalog(itemByName.get(ref.catalogName)!, { quantity: ref.quantity, position: idx })
  );
  return { inventoryCreates };
}

// Resolve a plain subclass name: link this class's catalog id when the name
// matches AND the class's edition-resolved gate is creation level (1), so
// FK-keyed derivations (granted spells #898) resolve. The catalog column is
// 2014-only (#1308) — gate through subclassGateLevel(edition), never the raw
// column. Otherwise keep it a legacy/homebrew string with no id (served once
// homebrew subclasses own catalog rows, #911).
async function resolveSubclassName(
  characterClass: ResolvedClass,
  name: string,
  edition: RulesEdition,
): Promise<{ subclassId: string | null; subclassName: string }> {
  if (subclassGateLevel(characterClass.subclassLevel, edition) <= 1) {
    const candidates = await prisma.subclass.findMany({
      where: withEditionOrShared({ classId: characterClass.id, name }, edition),
      select: { id: true, name: true, edition: true },
    });
    const match = resolveEditionRow(candidates, edition);
    if (match) return { subclassId: match.id, subclassName: match.name };
  }
  return { subclassId: null, subclassName: name };
}

// Validate a subclass choice: it must belong to the chosen class, and only a
// class whose EDITION-RESOLVED gate is level 1 can have one at creation (a
// brand-new character is always level 1) — 2014 Cleric/Sorcerer/Warlock (gate
// 1) yes, the same Cleric under 2024 no (gate 3, #1308). A legacy plain-string
// subclass (no id) is kept as-is for homebrew / pre-catalog data.
async function resolveSubclass(
  primaryClassChoice: PrimaryClassChoice,
  characterClass: ResolvedClass,
  edition: RulesEdition,
): Promise<PhaseResult<{ subclassId: string | null; subclassName: string | null }>> {
  if (primaryClassChoice.subclassId) {
    const subclass = await prisma.subclass.findUnique({
      where: { id: primaryClassChoice.subclassId },
    });
    if (!subclass) {
      return { ok: false, status: 400, error: `Unknown subclass id: ${primaryClassChoice.subclassId}` };
    }
    // Before the class-membership check, same ordering as class.ts's
    // applySetSubclass — a wrong-edition row is "not in this character's
    // catalog at all" (#1345). `editionOf` is structurally impossible here:
    // the Character row doesn't exist yet, so this function's `edition` param
    // is resolveSelections' `input.rulesEdition ?? DEFAULT_RULES_EDITION`
    // (see that call site's comment) rather than a column read.
    const mismatch = crossEditionRejection(subclass, `Subclass "${subclass.name}"`, edition);
    if (mismatch) return { ok: false, status: 400, error: mismatch };
    if (subclass.classId !== characterClass.id) {
      return {
        ok: false,
        status: 400,
        error: `Subclass "${subclass.name}" does not belong to ${characterClass.name}`,
      };
    }
    const gateLevel = subclassGateLevel(characterClass.subclassLevel, edition);
    if (gateLevel > 1) {
      return {
        ok: false,
        status: 400,
        error: `${characterClass.name} grants its subclass at level ${gateLevel}, not at creation (level 1)`,
      };
    }
    return { ok: true, subclassId: subclass.id, subclassName: subclass.name };
  }
  if (primaryClassChoice.subclass) {
    return { ok: true, ...(await resolveSubclassName(characterClass, primaryClassChoice.subclass, edition)) };
  }
  return { ok: true, subclassId: null, subclassName: null };
}

// Validates the variant half of a #1679 species selection: a variant-bearing
// species requires variantId, a variantless species rejects one, and a
// supplied variantId must resolve to a variant belonging to THIS species.
// Split out of resolveSpeciesSelection purely to keep each function's own
// cyclomatic/cognitive complexity under the repo's health gate — same
// reasoning as validateSkillChoices/validateToolChoices splitting out of
// resolveProficiencies above.
function validateVariantSelection(
  species: { name: string; variants: { id: string; name: string; speedOverride: number | null }[] },
  variantId: string | undefined,
): PhaseResult<{ variant: { id: string; name: string; speedOverride: number | null } | null }> {
  const hasVariants = species.variants.length > 0;
  if (hasVariants && !variantId) {
    return {
      ok: false,
      status: 400,
      error: `Species "${species.name}" requires a variantId (it has ${species.variants.length} variant option(s))`,
    };
  }
  if (!hasVariants && variantId) {
    return { ok: false, status: 400, error: `Species "${species.name}" has no variants — variantId must be omitted` };
  }
  if (!variantId) return { ok: true, variant: null };

  const variant = species.variants.find((v) => v.id === variantId);
  if (!variant) {
    return {
      ok: false,
      status: 400,
      error: `Variant id ${variantId} does not belong to species "${species.name}"`,
    };
  }
  return { ok: true, variant };
}

type SpeciesCatalogRow = {
  id: string;
  name: string;
  speed: number;
  variants: { id: string; name: string; speedOverride: number | null }[];
};

// Fetches + validates the species catalog anchor alone (existence + edition
// match) — split out of resolveSpeciesSelection purely to keep each
// function's own cyclomatic/cognitive complexity under the repo's health
// gate, same reasoning as validateVariantSelection above.
async function resolveSpeciesCatalogRow(
  speciesId: string,
  edition: RulesEdition,
): Promise<PhaseResult<{ species: SpeciesCatalogRow }>> {
  const species = await prisma.species.findUnique({
    where: { id: speciesId },
    // id+name+speedOverride are read from variants here (existence/belongs-to
    // checks and the #1684 speed anchor); Dragonborn alone pulls 10 rows each
    // carrying abilityIncreases JSON, so this stays a narrow select.
    include: { variants: { select: { id: true, name: true, speedOverride: true } } },
  });
  if (!species) {
    return { ok: false, status: 400, error: `Unknown species id: ${speciesId}` };
  }
  const mismatch = crossEditionRejection(species, `Species "${species.name}"`, edition);
  if (mismatch) return { ok: false, status: 400, error: mismatch };
  return { ok: true, species };
}

// Resolves + validates the #1679/#1684 species/variant selection — the sole
// mechanical anchor (speciesId is required by the zod schema). `edition` is
// the same `resolveSelections`-computed local every other creation-time
// catalog lookup uses (the Character row doesn't exist yet, so there's no
// column to read via editionOf). Three rejection cases, matching the issue's
// AC: unknown species id and cross-edition species (resolveSpeciesCatalogRow
// above), a variant-bearing species missing its variantId, and a variantless
// species (or a cross-species variant) given one anyway (validateVariantSelection).
async function resolveSpeciesSelection(
  input: CreateCharacterBody,
  edition: RulesEdition,
): Promise<PhaseResult<SpeciesSelection>> {
  const catalogResult = await resolveSpeciesCatalogRow(input.speciesId, edition);
  if (!catalogResult.ok) return catalogResult;
  const { species } = catalogResult;

  const variantResult = validateVariantSelection(species, input.variantId);
  if (!variantResult.ok) return variantResult;
  const { variant } = variantResult;

  return {
    ok: true,
    speciesId: species.id,
    speciesName: species.name,
    variantId: variant?.id ?? null,
    variantName: variant?.name ?? null,
    speed: variant?.speedOverride ?? species.speed,
  };
}

// Whether the resolved species+variant selection grants any spell at all —
// species-level rows (variantId: null, none seeded this wave) OR the chosen
// variant's own rows (Elf's Drow/High Elf/Wood Elf, Gnome's Forest/Rock,
// Tiefling's Abyssal/Chthonic/Infernal, #1683). A count query, not a fetch:
// resolveCastingAbility below only needs the yes/no, never the rows
// themselves (those are read live at serialize time, never snapshotted here).
async function speciesGrantsSpells(speciesId: string, variantId: string | null): Promise<boolean> {
  const count = await prisma.speciesGrantedSpell.count({
    where: { speciesId, OR: variantId ? [{ variantId: null }, { variantId }] : [{ variantId: null }] },
  });
  return count > 0;
}

// Phase 1.7 — the casting-ability choice: required iff the resolved
// species+variant either grants a SpeciesGrantedSpell (#1683, a 2024 lineage/
// legacy) OR carries a chooseCantrip that leaves its ability open
// (chooseCantripNeedsPlayerAbility — Astral Fire, #1756). Rejected otherwise,
// with two distinct messages: a chooseCantrip that FIXES its ability (High
// Elf's Intelligence) must reject a submitted castingAbility differently from a
// species that grants no spells at all (Dragonborn ancestry). Immutable
// post-creation like every other species selection field — written straight
// through to CharacterRace.castingAbility; the zod schema already restricts it
// to the three ability names.
async function resolveCastingAbility(
  input: CreateCharacterBody,
  speciesSelection: SpeciesSelection,
  chooseCantrip: ChooseCantrip | null,
): Promise<PhaseResult<{ castingAbility: string | null }>> {
  const submitted = input.castingAbility;
  const grantsSpells = await speciesGrantsSpells(speciesSelection.speciesId, speciesSelection.variantId);
  const needsAbility = grantsSpells || chooseCantripNeedsPlayerAbility(chooseCantrip);
  if (!needsAbility) {
    if (submitted) {
      // A fixed-ability chooseCantrip (High Elf) vs. a genuinely spell-less
      // species — same rejection, different diagnosis.
      const error = chooseCantrip
        ? "castingAbility not allowed: this species/variant's spellcasting ability is fixed"
        : "castingAbility not allowed: this species/variant grants no spells";
      return { ok: false, status: 400, error };
    }
    return { ok: true, castingAbility: null };
  }
  if (!submitted) {
    return { ok: false, status: 400, error: "castingAbility required: this species/variant grants spells with a chosen casting ability" };
  }
  return { ok: true, castingAbility: submitted };
}

// #1689: the confirmed species/variant's own choice-bearing trait specs
// (SpeciesTrait.choice), split by discriminant — mirrors
// fetchMergedAbilityIncreases' own "narrow fetch for the confirmed selection
// only" shape (#1681). At most one of each kind exists in the wave-1 roster;
// the FIRST match wins if a future row ever seeds two of the same kind, the
// same priority rule resolveChosenIncreases uses for ability-increase specs.
type SpeciesChoiceSpecs = {
  chooseSkills: ChooseSkills | null;
  chooseCantrip: ChooseCantrip | null;
  // #1690: true when the confirmed species+variant carries a chooseOriginFeat
  // trait (2024 Human's Versatile) — a bare boolean, not a further spec, per
  // speciesTraitChoiceSchema's chooseOriginFeatSchema (the whole rule is
  // "Origin category", enforced live against the Feat catalog, never baked
  // into the trait row itself).
  chooseOriginFeat: boolean;
};

async function fetchSpeciesChoiceSpecs(speciesId: string, variantId: string | null): Promise<SpeciesChoiceSpecs> {
  const traits = await prisma.speciesTrait.findMany({
    where: { speciesId, OR: [{ variantId: null }, ...(variantId ? [{ variantId }] : [])] },
    select: { choice: true },
  });
  const choices = traits
    .map((t) => t.choice)
    .filter((c): c is NonNullable<typeof c> => c != null) as unknown as SpeciesTraitChoice[];
  return {
    chooseSkills: choices.find(isChooseSkills)?.chooseSkills ?? null,
    chooseCantrip: choices.find(isChooseCantrip)?.chooseCantrip ?? null,
    chooseOriginFeat: choices.some(isChooseOriginFeat),
  };
}

// #1689: validates speciesSkills against the trait's own count/from spec AND
// against the class/background picks already made (the "may not duplicate"
// rule named explicitly in the issue) — kept as its own function, called from
// validateSkillChoices below, so the duplicate-with-class/background message
// stays distinct from that function's own "invalid skill" / "too many"
// rejections, mirroring validateSpeciesChoose's split from the ability-
// increase spread checks (#1681).
function validateSpeciesSkillChoice(
  speciesSkills: string[] | undefined,
  spec: ChooseSkills | null,
  classBackgroundSkills: string[],
): Fail | { speciesSkills: string[] } {
  if (!spec) {
    if (speciesSkills) {
      return { ok: false, status: 400, error: "speciesSkills not allowed: this species has no skill choice" };
    }
    return { speciesSkills: [] };
  }
  if (!speciesSkills) {
    return { ok: false, status: 400, error: "speciesSkills required: this species grants a choice of skill proficiencies" };
  }
  const eligible = spec.from ?? SKILLS.map((s) => s.name);
  const invalid = speciesSkills.filter((s) => !eligible.includes(s));
  if (invalid.length > 0) {
    return { ok: false, status: 400, error: `speciesSkills: unknown or ineligible skill(s): ${invalid.join(", ")}` };
  }
  if (new Set(speciesSkills).size !== speciesSkills.length) {
    return { ok: false, status: 400, error: "speciesSkills must be distinct" };
  }
  if (speciesSkills.length !== spec.count) {
    return {
      ok: false,
      status: 400,
      error: `speciesSkills: choose exactly ${spec.count} distinct skill(s) (got ${speciesSkills.length})`,
    };
  }
  const duplicate = speciesSkills.filter((s) => classBackgroundSkills.includes(s));
  if (duplicate.length > 0) {
    return {
      ok: false,
      status: 400,
      error: `speciesSkills: ${duplicate.join(", ")} already chosen via class/background — species skills must be distinct from your other picks`,
    };
  }
  return { speciesSkills };
}

// Validate player skill selections against the class/background pools, then
// (#1689) the species' own skill choice against ITS spec and against these
// same picks.
function validateSkillChoices(
  skillProficiencies: string[],
  characterClass: ResolvedClass,
  background: ResolvedBackground,
  speciesSkillSpec: ChooseSkills | null,
  requestedSpeciesSkills: string[] | undefined,
): Fail | { speciesSkills: string[] } {
  const allowedSkills = new Set([
    ...characterClass.skillChoices,
    ...(background?.skillProficiencies ?? []),
  ]);
  const invalidSkills = skillProficiencies.filter((skill) => !allowedSkills.has(skill));
  if (invalidSkills.length > 0) {
    return { ok: false, status: 400, error: `Invalid skill proficiencies: ${invalidSkills.join(", ")}` };
  }

  const maxSkillChoices = characterClass.skillChoiceCount + (background?.skillProficiencies.length ?? 0);
  if (skillProficiencies.length > maxSkillChoices) {
    return {
      ok: false,
      status: 400,
      error: `Too many skill proficiencies selected (max ${maxSkillChoices})`,
    };
  }
  return validateSpeciesSkillChoice(requestedSpeciesSkills, speciesSkillSpec, skillProficiencies);
}

// Validate the player's tool selections against a pool + cap — shared by the
// class's own toolChoices/toolChoiceCount and the background's (#1779:
// Background mirrors CharacterClass's columns exactly, so one function
// serves both rather than two inline copies of the same rule). `poolLabel`
// only changes the error text, so a 400 names which pool rejected the pick.
// Fixed grants (background/class toolProficiencies) are applied server-side
// and never validated here — this only covers player PICKS.
function validateToolChoicePicks(
  playerPicks: string[],
  pool: string[],
  cap: number,
  poolLabel: "class" | "background"
): Fail | null {
  if (playerPicks.length === 0) return null;

  const allowedPicks = new Set(pool);
  const invalidPicks = playerPicks.filter((t) => !allowedPicks.has(t));
  if (invalidPicks.length > 0) {
    return {
      ok: false,
      status: 400,
      error: `Invalid tool choices: ${invalidPicks.join(", ")}. Must be from the ${poolLabel}'s toolChoices list.`,
    };
  }
  if (!playerPicks.every((t) => isKnownTool(t))) {
    return { ok: false, status: 400, error: `Unknown tool name in ${poolLabel} toolChoices` };
  }
  if (playerPicks.length > cap) {
    return {
      ok: false,
      status: 400,
      error: `Too many ${poolLabel} tool choices (max ${cap})`,
    };
  }
  return null;
}

type ToolPicks = { playerToolChoices: string[]; playerBackgroundToolChoices: string[] };

// Pure extraction of the request's two independent tool-choice picks (#1779:
// class's own toolChoices pool, and the background's own) — split out purely
// so the validate/assemble steps below stay under the repo's complexity gate.
function extractToolPicks(input: CreateCharacterBody): ToolPicks {
  return {
    playerToolChoices: input.toolChoices ?? [],
    playerBackgroundToolChoices: input.backgroundToolChoices ?? [],
  };
}

// Validates BOTH tool-choice pools (class + background, #1779) — split out
// of resolveToolProficiencies purely to keep ITS OWN cyclomatic/cognitive
// complexity under the repo's health gate — same reasoning as
// validateVariantSelection/resolveSpeciesCatalogRow elsewhere in this file.
// #1779: backgroundToolChoices is the SAME mechanism as the class's, one
// level down — Background carries its own toolChoices/toolChoiceCount pair,
// an independent pick/cap from the class's (PHB'14/PHB'24 Soldier/Noble's
// "one type of gaming set"), so it gets its own validation call rather than
// sharing the class pool.
function validateToolPicks(
  picks: ToolPicks,
  characterClass: ResolvedClass,
  background: ResolvedBackground,
): Fail | null {
  const classError = validateToolChoicePicks(
    picks.playerToolChoices,
    characterClass.toolChoices,
    characterClass.toolChoiceCount,
    "class"
  );
  if (classError) return classError;
  return validateToolChoicePicks(
    picks.playerBackgroundToolChoices,
    background?.toolChoices ?? [],
    background?.toolChoiceCount ?? 0,
    "background"
  );
}

// Assembles creation-fixed tool proficiencies from the two fixed sources
// (background/class toolProficiencies) plus the two VALIDATED picks — no
// species/race source exists: the flat Race model never seeded a
// toolProficiencies row (confirmed empty, #1684) and no species-granted
// tool-proficiency mechanism exists yet either. Player PICKS count as their
// own pool's source: class toolChoices as "class", background toolChoices
// (#1779) as "background" — matching the fixed-grant source they stand in for.
function assembleCreationToolProfs(
  characterClass: ResolvedClass,
  background: ResolvedBackground,
  picks: ToolPicks,
): CreationToolProf[] {
  return [
    ...(background?.toolProficiencies ?? []).map((name) => ({ name, source: "background" as const })),
    ...(characterClass.toolProficiencies ?? []).map((name) => ({ name, source: "class" as const })),
    ...picks.playerToolChoices.map((name) => ({ name, source: "class" as const })),
    ...picks.playerBackgroundToolChoices.map((name) => ({ name, source: "background" as const })),
  ];
}

// Orchestrates the three steps above. Split out of resolveProficiencies
// purely to keep ITS OWN complexity under the repo's health gate.
function resolveToolProficiencies(
  input: CreateCharacterBody,
  characterClass: ResolvedClass,
  background: ResolvedBackground,
): PhaseResult<{ creationToolProfs: CreationToolProf[] }> {
  const picks = extractToolPicks(input);
  const toolError = validateToolPicks(picks, characterClass, background);
  if (toolError) return toolError;
  return { ok: true, creationToolProfs: assembleCreationToolProfs(characterClass, background, picks) };
}

// Validate player skill + tool selections against the class/background pools
// (plus, #1689, the species' own skill choice) and assemble the
// creation-fixed tool proficiencies from all fixed sources.
function resolveProficiencies(
  input: CreateCharacterBody,
  characterClass: ResolvedClass,
  background: ResolvedBackground,
  speciesSkillSpec: ChooseSkills | null,
): PhaseResult<{ skillProficiencies: string[]; creationToolProfs: CreationToolProf[] }> {
  const skillProficiencies = input.skillProficiencies ?? [];
  const skillResult = validateSkillChoices(skillProficiencies, characterClass, background, speciesSkillSpec, input.speciesSkills);
  if ("ok" in skillResult) return skillResult;

  const toolResult = resolveToolProficiencies(input, characterClass, background);
  if (!toolResult.ok) return toolResult;

  // #1689: species-chosen skills fold into the SAME persisted proficiency
  // list class/background picks use (deriveCreatedCharacter's skills[].proficient
  // is a plain `.includes(name)` membership check) — no separate "source" is
  // tracked in this array; that provenance lives on CharacterRace.speciesSkills
  // instead (persistCreatedCharacter), read straight off validated input.
  return {
    ok: true,
    skillProficiencies: [...skillProficiencies, ...skillResult.speciesSkills],
    creationToolProfs: toolResult.creationToolProfs,
  };
}

// The two request-shape guards that must pass before any DB lookup (bad
// alignment / empty classes). Split out of resolveSelections purely to keep
// its own cyclomatic/cognitive complexity under the repo's health gate — same
// reasoning as validateVariantSelection/resolveSpeciesCatalogRow above.
function validateCreationBasics(
  input: CreateCharacterBody,
): PhaseResult<{ primaryClassChoice: PrimaryClassChoice }> {
  if (!ALIGNMENTS.includes(input.alignment)) {
    return { ok: false, status: 400, error: `Unknown alignment: ${input.alignment}` };
  }
  if (!input.classes.length) {
    return { ok: false, status: 400, error: "At least one class is required" };
  }
  return { ok: true, primaryClassChoice: input.classes[0] };
}

// Fetches + validates the class catalog anchor alone (species is resolved
// separately by resolveSpeciesSelection). Split out of resolveSelections
// purely to keep its own cyclomatic/cognitive complexity under the repo's
// health gate, same reasoning as validateVariantSelection /
// resolveSpeciesCatalogRow above.
async function resolveCharacterClass(
  primaryClassChoice: PrimaryClassChoice,
): Promise<PhaseResult<{ characterClass: ResolvedClass }>> {
  const characterClass = await prisma.characterClass.findUnique({
    where: { name: primaryClassChoice.name },
  });
  if (!characterClass) {
    return { ok: false, status: 400, error: `Unknown class: ${primaryClassChoice.name}` };
  }
  return { ok: true, characterClass };
}

// Phase 1 — selection resolution: validate alignment + class count, resolve the
// species/class/background catalog anchors, and validate subclass + proficiencies.
async function resolveSelections(
  input: CreateCharacterBody
): Promise<PhaseResult<ResolvedSelections>> {
  const basics = validateCreationBasics(input);
  if (!basics.ok) return basics;
  const { primaryClassChoice } = basics;

  // Sequential rather than Promise.all: the pg driver adapter's pool can
  // warn/queue when the same PrismaClient fires concurrent queries, and
  // these are cheap point-lookups, so there's no real cost to awaiting
  // each in turn.
  // Write-once column (#1285): the row doesn't exist yet, so there's no
  // `rulesEdition` to read via editionOf — DEFAULT_RULES_EDITION (lib/rules/edition.ts)
  // names the same default the create call below lets the column apply, so the
  // two can't drift apart. Resolved before the background lookup below, which
  // needs it to pick the right edition-tagged row (#1306).
  const edition: RulesEdition = input.rulesEdition ?? DEFAULT_RULES_EDITION;

  // The background only grants skill-proficiency choices (no mechanical
  // fields), so — unlike class/species — it's allowed to be homebrew: an
  // unresolved name is kept as-is with a null backgroundId rather than
  // rejected.
  const classResult = await resolveCharacterClass(primaryClassChoice);
  if (!classResult.ok) return classResult;
  const { characterClass } = classResult;

  const backgroundCandidates = await prisma.background.findMany({
    where: withEditionOrShared({ name: input.background }, edition),
    include: { originFeat: true },
  });
  const background = resolveEditionRow(backgroundCandidates, edition) ?? null;

  const subclass = await resolveSubclass(primaryClassChoice, characterClass, edition);
  if (!subclass.ok) return subclass;

  const speciesSelection = await resolveSpeciesSelection(input, edition);
  if (!speciesSelection.ok) return speciesSelection;

  // #1689: fetched before proficiencies below — resolveProficiencies needs
  // chooseSkills to validate speciesSkills.
  const speciesChoiceSpecs = await fetchSpeciesChoiceSpecs(speciesSelection.speciesId, speciesSelection.variantId);

  const proficiencies = resolveProficiencies(input, characterClass, background, speciesChoiceSpecs.chooseSkills);
  if (!proficiencies.ok) return proficiencies;

  return {
    ok: true,
    primaryClassChoice,
    characterClass,
    background,
    subclassId: subclass.subclassId,
    subclassName: subclass.subclassName,
    skillProficiencies: proficiencies.skillProficiencies,
    creationToolProfs: proficiencies.creationToolProfs,
    edition,
    speciesSelection: {
      speciesId: speciesSelection.speciesId,
      speciesName: speciesSelection.speciesName,
      variantId: speciesSelection.variantId,
      variantName: speciesSelection.variantName,
      speed: speciesSelection.speed,
    },
    speciesChoiceSpecs,
  };
}

// Shared per-ability 20-cap check (SRD 5.2/5.1's one ABILITY_CAP): every
// ability-spread validator below — background's, and #1681's species
// choose/floating/fixed — ends with this same "would exceed 20" rejection, so
// it lives once rather than four near-identical copies (fallow's duplication
// gate flagged the original three-copy spread).
function abilityCapOverflowError(
  entries: [string, number][],
  base: Record<string, number>,
  fieldName: string,
): Fail | null {
  const over = entries.find(([ability, amount]) => (base[ability] ?? 10) + amount > ABILITY_CAP);
  if (!over) return null;
  return { ok: false, status: 400, error: `${fieldName}: ${over[0]} would exceed ${ABILITY_CAP}` };
}

// Validates the spread: every bump is one of the background's three abilities,
// the shape is legal, and no resulting score tops the 20 cap (SRD 5.2).
// floatingSpreadShapeValid is the #1681-extracted shared shape check — species'
// own floating-spread validator (validateSpeciesFloating below) calls the SAME
// function, not a copy.
function validateBackgroundSpread(
  spread: Record<string, number>,
  choices: string[],
  base: Record<string, number>,
): Fail | null {
  const entries = Object.entries(spread);
  const invalid = entries.filter(([ability]) => !choices.includes(ability)).map(([a]) => a);
  if (invalid.length > 0) {
    return { ok: false, status: 400, error: `backgroundAbilities: ${invalid.join(", ")} not in this background's choices (${choices.join(", ")})` };
  }
  if (!floatingSpreadShapeValid(entries.map(([, amount]) => amount))) {
    return { ok: false, status: 400, error: "backgroundAbilities must be +2/+1 (two abilities) or +1/+1/+1 (three abilities)" };
  }
  return abilityCapOverflowError(entries, base, "backgroundAbilities");
}

// Snapshots the background's Origin feat into a slot-exempt AdvancementEntry
// (#1130). Magic Initiate's granted class is folded into the description snapshot.
//
// Origin feats are a PHB'24-only mechanic (#1504) — backgroundGrantsOriginFeat
// gates a 2014 character out before any resolution runs, so everything below
// this point only ever executes for EDITION_2024.
//
// Background.originFeatId is a single FK, fixed once at seed time to a
// representative row (the reference-display default — same "no character to
// resolve against" reasoning as reference.ts's subclassLevel hardcode). A
// character actually being CREATED has an edition, so re-resolve the feat by
// NAME against THIS character's edition (#1306) rather than trust whichever
// row got baked — Alert forks into EDITION_2014/EDITION_2024 rows with no
// shared fallback, so a wrong-edition baked FK must not leak through. No
// fallback to the baked row on a miss: silently snapshotting the OTHER
// edition's mechanics into a permanent AdvancementEntry is exactly the
// contamination this function exists to prevent — grant nothing rather than
// grant the wrong thing. Since edition is always EDITION_2024 here, Alert's
// fork always resolves cleanly in practice; the guard stays for any future
// feat that forks without a null row.
async function buildOriginEntry(background: ResolvedBackground, edition: RulesEdition): Promise<AdvancementEntry | null> {
  if (!backgroundGrantsOriginFeat(edition)) return null;
  if (!background?.originFeat) return null;
  const baked = background.originFeat;
  const candidates = await prisma.feat.findMany({ where: withEditionOrShared({ name: baked.name }, edition) });
  const feat = resolveEditionRow(candidates, edition);
  if (!feat) return null;
  const flavor = feat.name === "Magic Initiate" ? MAGIC_INITIATE_CLASS_BY_BACKGROUND[background.name] : undefined;
  const featDescription = flavor ? `${feat.description}\n\nBackground grant: ${flavor} spell list.` : feat.description;
  return {
    id: randomUUID(),
    level: 1,
    kind: "feat",
    origin: true,
    abilityDeltas: {},
    hpDelta: 0,
    initDelta: 0,
    featId: feat.id,
    featName: feat.name,
    featDescription,
    improvements: (feat.improvements as unknown as FeatImprovement[]) ?? [],
  };
}

// Phase 1.5 — background grants (#1130): validate + fold the ability spread into
// effective scores (baked BEFORE deriveCreatedCharacter so HP/init are correct)
// and snapshot the Origin feat. A spec-less/custom background rejects any spread
// but still grants its (absent) feat; omitting the spread applies no bump.
//
// The ability spread is a PHB'24-only mechanic (#1572) — a 2014 character
// submitting one is rejected outright, distinctly from the spec-less-background
// 400 below, before that background's own abilityChoices are even consulted
// (Criminal/Sage/etc. carry a real spec under `edition: null`, resolvable for
// either edition, so the choices-length check alone would let a 2014 character
// through on any background PHB'24 backgrounds share with 2014).
async function resolveBackgroundGrants(
  input: CreateCharacterBody,
  background: ResolvedBackground,
  edition: RulesEdition,
): Promise<PhaseResult<BackgroundGrants>> {
  const spread = input.backgroundAbilities;
  const choices = background?.abilityChoices ?? [];

  if (spread) {
    if (!backgroundGrantsAbilitySpread(edition)) {
      return { ok: false, status: 400, error: "backgroundAbilities not allowed: background ability scores are a 2024 rule" };
    }
    if (choices.length === 0) {
      return { ok: false, status: 400, error: "backgroundAbilities not allowed: this background has no ability spread" };
    }
    const shapeError = validateBackgroundSpread(spread, choices, input.abilityScores);
    if (shapeError) return shapeError;
  }

  return {
    ok: true,
    effectiveScores: applyAbilitySpread(input.abilityScores, spread),
    originEntry: await buildOriginEntry(background, edition),
  };
}

// Species grants resolved from the request: the ability increases already
// folded into effective scores (baked before deriveCreatedCharacter, same
// #1130 shape as BackgroundGrants) and the exact {ability, amount}[] applied —
// the CharacterRace.abilityBonuses provenance snapshot the background spread
// has no equivalent of.
type SpeciesGrants = {
  effectiveScores: Record<string, number>;
  appliedIncreases: { ability: string; amount: number }[];
};

// Splits a merged Species+SpeciesVariant abilityIncreases spec array into its
// three forms by discriminant key. `fixed` entries are summed per ability
// (Human's six separate +1s land in one record); `choose`/`floating` are kept
// as the raw sub-specs since resolveSpeciesGrants validates each against the
// request's `speciesAbilities` before applying.
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

// Validates the CHOSEN portion of a choose-from-list spec (Half-Elf's "+1 to
// two of your choice") — composes the same membership + per-ability-cap checks
// resolveHalfFeatBump (advancement.ts) applies to a half-feat's ability bump,
// generalized from one pick to `count` distinct picks. A Record's keys are
// already distinct, so "count distinct abilities" reduces to "exactly `count`
// entries" once membership is confirmed.
function validateSpeciesChoose(
  spec: ChooseIncrease,
  submitted: Record<string, number>,
  fixedAbilities: Set<string>,
  base: Record<string, number>,
): Fail | { chosen: Record<string, number> } {
  const eligible: string[] = spec.from ?? [...ABILITY_NAMES];
  const entries = Object.entries(submitted);

  const invalid = entries.filter(([ability]) => !eligible.includes(ability) || fixedAbilities.has(ability));
  if (invalid.length > 0) {
    // The options list excludes the species' fixed abilities: a fixed +N ability
    // is never a valid CHOOSE target, so listing it as an option contradicts the
    // "not eligible" complaint it triggers (e.g. Half-Elf's CHA).
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
  return abilityCapOverflowError(entries, base, "speciesAbilities") ?? { chosen: Object.fromEntries(entries) };
}

// Validates a floating-spread spec (the Astral Elf shape, seeded only as a
// #1679 test fixture this wave — no real PHB'14 roster row uses it) via the
// SAME floatingSpreadShapeValid the background spread validates with (#1681
// AC: proven by symbol, not by a second copy of the shape rule).
function validateSpeciesFloating(
  submitted: Record<string, number>,
  fixedAbilities: Set<string>,
  base: Record<string, number>,
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
  return abilityCapOverflowError(entries, base, "speciesAbilities") ?? { chosen: Object.fromEntries(entries) };
}

// Resolves the CHOSEN portion of a merged spec (everything beyond the fixed
// increases, which apply unconditionally with no player input). `chooseSpecs`
// and `floatingSpecs` never both carry entries in the current roster + fixture
// (Half-Elf: fixed + choose; the Astral Elf fixture: floating alone) — choose
// wins if a future row ever seeds both, since Half-Elf-shaped content is the
// only real PHB'14 case; revisit this priority if that changes.
function resolveChosenIncreases(
  chooseSpecs: ChooseIncrease[],
  floatingSpecs: number[],
  submitted: Record<string, number> | undefined,
  fixedAbilities: Set<string>,
  base: Record<string, number>,
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
    return validateSpeciesChoose(chooseSpecs[0], submitted, fixedAbilities, base);
  }
  return validateSpeciesFloating(submitted, fixedAbilities, base);
}

// Rejects a submitted speciesAbilities under the wrong edition — split out of
// resolveSpeciesGrants purely to keep its own cyclomatic/cognitive complexity
// under the repo's health gate, same reasoning as validateVariantSelection /
// resolveSpeciesCatalogRow above.
function speciesAbilitiesEditionGuard(
  submitted: Record<string, number> | undefined,
  edition: RulesEdition,
): Fail | null {
  if (submitted && !speciesGrantsAbilityIncreases(edition)) {
    return { ok: false, status: 400, error: "speciesAbilities not allowed: species ability increases are a 2014 rule" };
  }
  return null;
}

// Narrow fetch (abilityIncreases only) for the CONFIRMED species/variant —
// resolveSpeciesCatalogRow's own species.findUnique (in resolveSpeciesSelection)
// deliberately avoids this column for every candidate variant (its comment:
// Dragonborn alone carries 10 variant rows). This is the one place that
// column is read, and only once the edition gate has confirmed it's needed.
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
  // A replacing variant (Astral Elf, #1751) supplies the ENTIRE species ability
  // increase — the base species' increases are dropped, not stacked, because it
  // is a standalone race modelled as a variant, not a subrace of the base. Every
  // real subrace leaves the flag false and stacks additively (the common case).
  if (variant?.abilityIncreasesReplace) return variantIncreases;
  return [...(species.abilityIncreases as unknown as AbilityIncreaseSpec[]), ...variantIncreases];
}

// Phase 1.6 — species grants (#1681): merge the species + variant abilityIncreases
// specs (#1679), validate the chosen portion against `speciesAbilities`, and fold
// BOTH fixed and chosen increases into effective scores — baked BEFORE
// deriveCreatedCharacter, same "no reversible delta" shape as the background
// spread (#1130), and for the same reason: species is immutable post-creation
// (no species transaction endpoint), so there is nothing for a delta to ever reverse.
// No LEVEL_GATED_RECONCILERS entry follows from the same fact — the legal
// maximum this state can reach never changes with level, only at creation.
//
// Ability increases are a PHB'14-only mechanic (#1572's mirror image) —
// speciesGrantsAbilityIncreases gates a 2024 character out before the catalog
// spec is even fetched, so a 2024 species row's (always empty) spec is never
// the reason 2024 gets nothing; the edition gate is.
async function resolveSpeciesGrants(
  input: CreateCharacterBody,
  speciesSelection: SpeciesSelection,
  edition: RulesEdition,
  baseScores: Record<string, number>,
): Promise<PhaseResult<SpeciesGrants>> {
  const submitted = input.speciesAbilities;

  // speciesId is required by the create schema (the species-only path, #1684),
  // so the selection always resolves one here — there is no "no species"
  // fallback to guard.
  const editionError = speciesAbilitiesEditionGuard(submitted, edition);
  if (editionError) return editionError;
  if (!speciesGrantsAbilityIncreases(edition)) {
    return { ok: true, effectiveScores: baseScores, appliedIncreases: [] };
  }

  const specs = await fetchMergedAbilityIncreases(speciesSelection.speciesId, speciesSelection.variantId);
  const { fixedSpread, chooseSpecs, floatingSpecs } = splitAbilityIncreaseSpecs(specs);

  // Fixed increases are server-applied, not submitted in speciesAbilities — name
  // the field "species" so a cap overflow doesn't point a client at a field it
  // never sent (the chosen-increase overflow below still names speciesAbilities).
  const fixedCapError = abilityCapOverflowError(Object.entries(fixedSpread), baseScores, "species");
  if (fixedCapError) return fixedCapError;

  const chosenResult = resolveChosenIncreases(chooseSpecs, floatingSpecs, submitted, new Set(Object.keys(fixedSpread)), baseScores);
  if ("ok" in chosenResult) return chosenResult;

  const fullSpread = { ...fixedSpread, ...chosenResult.chosen };
  return {
    ok: true,
    effectiveScores: applyAbilitySpread(baseScores, fullSpread),
    appliedIncreases: Object.entries(fullSpread).map(([ability, amount]) => ({ ability, amount })),
  };
}

// Validate a chosen-gold amount against the class's dice range. `classDef` is
// null for a class with no seeded package (e.g. a homebrew/test-fixture
// class) — the range check is skipped rather than rejected, preserving the
// pre-#1534 behaviour for an unknown class (characters.test.ts:901's sibling
// gold-mode case).
//
// classDef.gold is null for a package with no roll-for-gold rule at all
// (PHB'24, #1564 commit 3) — reject rather than silently compute, since a
// range derived from null dice is meaningless, not just wrong. This makes
// `mode: "gold"` a 2014-only path in practice: PHB'24 reaches its gold
// through a lettered StartingEquipmentOption.gold in package mode instead
// (commit 2), never this dice-roll alternative.
function resolveStartingGold(
  gold: number,
  className: string,
  classDef: ClassEquipmentDef | null,
): PhaseResult<{ startingCurrency: { cp: number; sp: number; gp: number; pp: number } }> {
  if (classDef) {
    if (!classDef.gold) {
      return {
        ok: false,
        status: 400,
        error: `${className} has no roll-for-gold alternative under this ruleset — choose a starting-equipment package option instead`,
      };
    }
    const { diceCount, diceFaces, multiplier } = classDef.gold;
    const min = diceCount * multiplier;
    const max = diceCount * diceFaces * multiplier;
    if (gold < min || gold > max) {
      return {
        ok: false,
        status: 400,
        error: `Starting gold must be between ${min} and ${max} for ${className}`,
      };
    }
  }
  return { ok: true, startingCurrency: { cp: 0, sp: 0, gp: gold, pp: 0 } };
}

type EquipmentGroup = ClassEquipmentDef["groups"][number];
type EquipmentBundle = EquipmentGroup["options"][number];
type PackageSelection = PackageEquipment["selections"][number];
type OpenPick = NonNullable<EquipmentBundle["openPicks"]>[number];
type FixedRef = { catalogName: string; quantity: number };

// Fixed items in the chosen bundle — pack names are expanded in resolveFixedItems.
function bundleFixedRefs(bundle: EquipmentBundle): FixedRef[] {
  return (bundle.items ?? []).map((ref) => ({ catalogName: ref.catalogName, quantity: ref.quantity ?? 1 }));
}

type OpenPickCatalogItem = {
  name: string;
  category: string;
  toolCategory: string | null;
  weaponDetail?: { weaponClass: string | null; weaponRange: string | null } | null;
};

// One of openPickFilterError's three branches (#1564), split out purely to
// keep that function's own cyclomatic/cognitive complexity low. A
// toolCategory-filtered pick requires the catalog item's own toolCategory to
// match; null (pass) when the pick carries no toolCategory filter at all.
function toolCategoryFilterError(catalogItem: OpenPickCatalogItem, pick: OpenPick, chosenName: string): Fail | null {
  if (!pick.filter.toolCategory || catalogItem.toolCategory === pick.filter.toolCategory) return null;
  return {
    ok: false,
    status: 400,
    error: `Open pick "${chosenName}" does not satisfy filter: toolCategory must be "${pick.filter.toolCategory}"`,
  };
}

// A boundToToolChoice pick isn't a free choice at all — the chosen item must
// be one of the character's own creation tool choices (creationToolProfs,
// already resolved and validated by resolveProficiencies). Monk's "Artisan's
// Tools or Musical Instrument chosen for the tool proficiency above."
function boundToolChoiceError(chosenName: string, creationToolProfs: CreationToolProf[]): Fail | null {
  const isChosenToolProf = creationToolProfs.some((p) => p.name === chosenName);
  if (isChosenToolProf) return null;
  return {
    ok: false,
    status: 400,
    error: `Open pick "${chosenName}" is not one of this character's chosen tool proficiencies`,
  };
}

// The pre-#1564 weapon-only behaviour, unchanged — reached only when the
// pick carries neither toolCategory nor boundToToolChoice.
function weaponFilterError(catalogItem: OpenPickCatalogItem, pick: OpenPick, chosenName: string): Fail | null {
  if (catalogItem.category !== "weapon") {
    return { ok: false, status: 400, error: `Open pick "${chosenName}" is not a known weapon in the catalog` };
  }
  if (pick.filter.weaponClass && catalogItem.weaponDetail?.weaponClass !== pick.filter.weaponClass) {
    return {
      ok: false,
      status: 400,
      error: `Open pick "${chosenName}" does not satisfy filter: weaponClass must be "${pick.filter.weaponClass}"`,
    };
  }
  if (pick.filter.range && catalogItem.weaponDetail?.weaponRange !== pick.filter.range) {
    return {
      ok: false,
      status: 400,
      error: `Open pick "${chosenName}" does not satisfy filter: range must be "${pick.filter.range}"`,
    };
  }
  return null;
}

// Check a looked-up catalog item against an open-pick filter; null when it
// passes. Dispatches to the three branches above (#1564): a weapon-filtered
// pick (no toolCategory, no boundToToolChoice) keeps the original behaviour
// exactly; a toolCategory-filtered pick requires the catalog item's own
// toolCategory to match; a boundToToolChoice pick ADDITIONALLY (on top of any
// toolCategory check) requires tool-choice membership, and — being bound to
// an existing choice rather than a free pick — skips the weapon-category
// requirement entirely (ANY category is fine, so long as it's a tool the
// character is already proficient in).
function openPickFilterError(
  catalogItem: OpenPickCatalogItem | null,
  pick: OpenPick,
  chosenName: string,
  creationToolProfs: CreationToolProf[],
): Fail | null {
  if (!catalogItem) {
    return { ok: false, status: 400, error: `Open pick "${chosenName}" is not a known catalog item` };
  }

  const toolCategoryError = toolCategoryFilterError(catalogItem, pick, chosenName);
  if (toolCategoryError) return toolCategoryError;

  if (pick.boundToToolChoice) return boundToolChoiceError(chosenName, creationToolProfs);
  if (pick.filter.toolCategory) return null;

  return weaponFilterError(catalogItem, pick, chosenName);
}

// Validate one player open-pick (catalog lookup + filter) into a fixed ref.
async function validateOpenPick(
  chosenName: string,
  pick: OpenPick,
  creationToolProfs: CreationToolProf[],
): Promise<PhaseResult<{ ref: FixedRef }>> {
  const catalogItem = await prisma.item.findUnique({
    // Pinned to the GLOBAL catalog (#1645). Starting equipment resolves seeded
    // content, so a campaign-scoped row must never satisfy an open pick — once
    // #1646 merges DM-authored items into this table, an unpinned lookup would
    // let a homebrew row shadow the catalog name the package meant.
    where: { scopeKey_name: { scopeKey: "global", name: chosenName } },
    include: { weaponDetail: true },
  });
  const error = openPickFilterError(catalogItem, pick, chosenName, creationToolProfs);
  if (error) return error;
  return { ok: true, ref: { catalogName: chosenName, quantity: pick.quantity ?? 1 } };
}

// Validate + collect the open-pick refs for one selected bundle.
async function collectOpenPickRefs(
  bundle: EquipmentBundle,
  sel: PackageSelection,
  groupIdx: number,
  creationToolProfs: CreationToolProf[],
): Promise<PhaseResult<{ refs: FixedRef[] }>> {
  const openPicks = bundle.openPicks ?? [];
  const providedPicks = sel.openPicks ?? [];
  if (providedPicks.length !== openPicks.length) {
    return {
      ok: false,
      status: 400,
      error: `Equipment group ${groupIdx}, option ${sel.optionIndex}: expected ${openPicks.length} open picks, got ${providedPicks.length}`,
    };
  }

  const refs: FixedRef[] = [];
  for (let pickIdx = 0; pickIdx < openPicks.length; pickIdx++) {
    const pick = await validateOpenPick(providedPicks[pickIdx], openPicks[pickIdx], creationToolProfs);
    if (!pick.ok) return pick;
    refs.push(pick.ref);
  }
  return { ok: true, refs };
}

// Validate one selected group (optionIndex in range) and collect its fixed +
// open-pick refs (packs expanded downstream) plus the chosen bundle's gold
// (#1564 — PHB'24's per-option GP; 0 for every 2014 option).
async function collectGroupRefs(
  group: EquipmentGroup,
  sel: PackageSelection,
  groupIdx: number,
  creationToolProfs: CreationToolProf[],
): Promise<PhaseResult<{ refs: FixedRef[]; gold: number }>> {
  if (sel.optionIndex < 0 || sel.optionIndex >= group.options.length) {
    return {
      ok: false,
      status: 400,
      error: `Equipment group ${groupIdx}: optionIndex ${sel.optionIndex} out of range (0–${group.options.length - 1})`,
    };
  }

  const bundle = group.options[sel.optionIndex];
  const openPickRefs = await collectOpenPickRefs(bundle, sel, groupIdx, creationToolProfs);
  if (!openPickRefs.ok) return openPickRefs;

  return { ok: true, refs: [...bundleFixedRefs(bundle), ...openPickRefs.refs], gold: bundle.gold ?? 0 };
}

// Walk the class package groups, validating each selection and collecting the
// fixed catalog refs AND the summed gold (#1564) across all groups.
async function collectPackageRefs(
  se: PackageEquipment,
  classDef: ClassEquipmentDef,
  creationToolProfs: CreationToolProf[],
): Promise<PhaseResult<{ allFixedRefs: FixedRef[]; totalGold: number }>> {
  if (se.selections.length !== classDef.groups.length) {
    return {
      ok: false,
      status: 400,
      error: `Expected ${classDef.groups.length} equipment selections, got ${se.selections.length}`,
    };
  }

  const allFixedRefs: FixedRef[] = [];
  let totalGold = 0;
  for (let groupIdx = 0; groupIdx < classDef.groups.length; groupIdx++) {
    const group = await collectGroupRefs(classDef.groups[groupIdx], se.selections[groupIdx], groupIdx, creationToolProfs);
    if (!group.ok) return group;
    allFixedRefs.push(...group.refs);
    totalGold += group.gold;
  }
  return { ok: true, allFixedRefs, totalGold };
}

// The one (classId, edition) lookup both starting-equipment phases share —
// exact match, not resolveEditionRow: StartingEquipmentPackage.edition is
// non-nullable, so there is no shared/NULL row to fall back to (#1534). Null
// for a class with no seeded package (homebrew/test-fixture classes).
async function loadClassEquipmentDef(classId: string, edition: RulesEdition): Promise<ClassEquipmentDef | null> {
  const row = await prisma.startingEquipmentPackage.findUnique({
    where: { classId_edition: { classId, edition } },
    include: EQUIPMENT_PACKAGE_INCLUDE,
  });
  return row ? mapStartingEquipmentPackage(row) : null;
}

// #1565's twin of loadClassEquipmentDef above — (backgroundId, edition), the
// compound unique StartingEquipmentPackage.@@unique([backgroundId, edition])
// generates. `backgroundId` is null for a homebrew/unresolved background
// (resolveSelections' background is allowed to miss a catalog anchor), which
// this treats identically to "no seeded package for this class": null in,
// null out, no query at all.
async function loadBackgroundEquipmentDef(
  backgroundId: string | null,
  edition: RulesEdition,
): Promise<ClassEquipmentDef | null> {
  if (!backgroundId) return null;
  const row = await prisma.startingEquipmentPackage.findUnique({
    where: { backgroundId_edition: { backgroundId, edition } },
    include: EQUIPMENT_PACKAGE_INCLUDE,
  });
  return row ? mapStartingEquipmentPackage(row) : null;
}

// Re-resolve a package selection authoritatively against the loaded package
// and expand it into InventoryItem create payloads plus the summed gold
// (#1564) across the chosen options. `classDef` null means no seeded package
// for this subject — preserves the pre-#1534 "no entry" 400
// (characters.test.ts:901) for a class, and is the SAME shape #1565 reuses
// for a background with no package (a 2014 background other than Acolyte and
// Folk Hero, or homebrew).
// `subjectLabel` (e.g. "class: Fighter" / "background: Criminal") is
// player-facing only — never used to resolve anything.
async function resolvePackageInventory(
  se: PackageEquipment,
  subjectLabel: string,
  classDef: ClassEquipmentDef | null,
  creationToolProfs: CreationToolProf[],
): Promise<PhaseResult<{ inventoryItemCreates: InventoryCreate[]; totalGold: number }>> {
  if (!classDef) {
    return {
      ok: false,
      status: 400,
      error: `No starting equipment package defined for ${subjectLabel}`,
    };
  }

  const refs = await collectPackageRefs(se, classDef, creationToolProfs);
  if (!refs.ok) return refs;

  const { inventoryCreates, error } = await resolveFixedItems(refs.allFixedRefs);
  if (error) return { ok: false, status: 400, error };
  return { ok: true, inventoryItemCreates: inventoryCreates, totalGold: refs.totalGold };
}

// The background half of Phase 2 (#1565) — split out purely to keep
// materializeStartingEquipment's own cyclomatic complexity low. A background
// never has a roll-for-gold dice alternative in either edition (unlike a 2014
// class), so `mode: "gold"` here is always a 400, never a resolveStartingGold
// range check. `backgroundId` null (homebrew/unresolved background, or one
// with no package under this edition — any 2014 background but Acolyte and
// Folk Hero) makes
// loadBackgroundEquipmentDef's null propagate into resolvePackageInventory's
// existing "no seeded package" 400 — the same shape a class with no package hits.
async function resolveBackgroundEquipmentInventory(
  bse: NonNullable<CreateCharacterBody["backgroundStartingEquipment"]>,
  backgroundId: string | null,
  backgroundDisplayName: string,
  edition: RulesEdition,
  creationToolProfs: CreationToolProf[],
): Promise<PhaseResult<{ inventoryItemCreates: InventoryCreate[]; totalGold: number }>> {
  if (bse.mode === "gold") {
    return {
      ok: false,
      status: 400,
      error: `${backgroundDisplayName} has no roll-for-gold alternative under this ruleset — choose a starting-equipment package option instead`,
    };
  }
  const backgroundDef = await loadBackgroundEquipmentDef(backgroundId, edition);
  return resolvePackageInventory(bse, `background: ${backgroundDisplayName}`, backgroundDef, creationToolProfs);
}

// Phase 2 — starting-equipment materialization. Optional: omitting BOTH
// fields yields an empty-inventory character. The class gold path sets an
// explicit currency; the class AND background package paths each contribute
// InventoryItem payloads plus their own GP, and the two GP amounts ADD
// (#1565 — a 2024 Criminal Fighter picking option A on both gets 4+16=20 GP,
// never one silently overwriting the other). Starting weapons/armor are
// auto-equipped so the in-session Attack picker isn't empty on a fresh sheet
// (issue #51). The class package is keyed by (classId, edition) — see
// loadClassEquipmentDef; the background package by (backgroundId, edition) —
// see loadBackgroundEquipmentDef. primaryClassName/backgroundDisplayName are
// kept only for player-facing error messages. creationToolProfs (#1564) is
// threaded through so a boundToToolChoice open pick (Monk's tool-bound entry,
// Soldier's "Gaming Set (same as above)") can check membership against the
// SAME resolved+validated list resolveProficiencies already produced — never
// a second, independent re-resolution of the character's tool choices.
async function materializeStartingEquipment(
  input: CreateCharacterBody,
  classId: string,
  primaryClassName: string,
  backgroundId: string | null,
  backgroundDisplayName: string,
  edition: RulesEdition,
  creationToolProfs: CreationToolProf[],
): Promise<PhaseResult<MaterializedEquipment>> {
  const inventoryItemCreates: InventoryCreate[] = [];
  let totalGold = 0;
  // Currency is only overridden when at least one of class/background
  // equipment was actually chosen — omitting BOTH keeps deriveCreatedCharacter's
  // own default currency untouched, same as the pre-#1565 "no `se`" behaviour.
  let anyEquipmentChosen = false;

  const se = input.startingEquipment;
  if (se) {
    anyEquipmentChosen = true;
    const classDef = await loadClassEquipmentDef(classId, edition);
    if (se.mode === "gold") {
      const gold = resolveStartingGold(se.gold, primaryClassName, classDef);
      if (!gold.ok) return gold;
      totalGold += se.gold;
    } else {
      const pkg = await resolvePackageInventory(se, `class: ${primaryClassName}`, classDef, creationToolProfs);
      if (!pkg.ok) return pkg;
      inventoryItemCreates.push(...pkg.inventoryItemCreates);
      totalGold += pkg.totalGold;
    }
  }

  const bse = input.backgroundStartingEquipment;
  if (bse) {
    anyEquipmentChosen = true;
    const pkg = await resolveBackgroundEquipmentInventory(bse, backgroundId, backgroundDisplayName, edition, creationToolProfs);
    if (!pkg.ok) return pkg;
    inventoryItemCreates.push(...pkg.inventoryItemCreates);
    totalGold += pkg.totalGold;
  }

  // Explicit even when 0 (every EDITION_2014 class package, and any package
  // combination that nets 0 GP) — same persisted value deriveCreatedCharacter's
  // default already writes, but written here so a chosen package can't
  // silently drop its GP the way an untouched `startingCurrency` would (#1564).
  const startingCurrency = anyEquipmentChosen ? { cp: 0, sp: 0, gp: totalGold, pp: 0 } : undefined;

  // The 5e selection rule lives in lib/ (selectAutoEquip); apply its decision
  // by assigning each chosen payload its paper-doll slot (#565).
  for (const idx of selectAutoEquip(inventoryItemCreates)) {
    inventoryItemCreates[idx].equippedSlot = autoEquipSlot(inventoryItemCreates[idx]);
  }

  return { ok: true, inventoryItemCreates, startingCurrency };
}

// The base catalog row plus the join-resolved `classes: string[]` (#1711) —
// every creation-picker read attaches this via classesOf so creationPickError
// can check membership without knowing the join exists.
type CreationSpellRow = NonNullable<Awaited<ReturnType<typeof prisma.spell.findFirst>>> & { classes: string[] };

// Validate one chosen catalog row against the class list and its expected level
// band (cantrip = level 0; leveled = 1..maxLevel). Null when the pick is legal.
// `expandedSpellIds` (#1631) admits a row NOT on the class's own list when the
// chosen subclass's SubclassSpellListExpansion adds it (PHB'14 Warlock
// patrons) — still subject to the cantrip/level-band checks above, since a
// list-expansion never widens the LEVEL a known caster can learn, only which
// names are legal at that level.
function creationPickError(
  row: CreationSpellRow | undefined,
  id: string,
  kind: "cantrip" | "spell",
  className: string,
  classDisplay: string,
  maxLevel: number,
  expandedSpellIds: Set<string> = new Set(),
): Fail | null {
  if (!row) return { ok: false, status: 400, error: `Unknown spell id: ${id}` };
  if (kind === "cantrip" && row.level !== 0) {
    return { ok: false, status: 400, error: `${row.name} is not a cantrip` };
  }
  if (kind === "spell" && (row.level < 1 || row.level > maxLevel)) {
    return { ok: false, status: 400, error: `${row.name} is not a spell ${classDisplay} can learn at level 1 (max spell level: ${maxLevel})` };
  }
  if (!row.classes.includes(className) && !expandedSpellIds.has(id)) {
    return { ok: false, status: 400, error: `${row.name} is not on the ${classDisplay} spell list` };
  }
  return null;
}

type CreationSpells = NonNullable<CreateCharacterBody["spells"]>;

// Precondition + count checks for creation picks: the class must cast at level 1,
// the two lists must match the level-1 counts (per edition), and no id may repeat.
// #1510 D4: both counts come from level1SpellPicksFor — the SAME function
// reference.ts serves, so a served count and an enforced count can never
// disagree by construction (no separate abilityScores-driven read here: a
// 2014 Cleric/Druid's creation picks are 0 regardless of Wisdom — see that
// function's comment for why).
function creationSpellCountError(
  spells: CreationSpells,
  className: string,
  classDisplay: string,
  subclass: string | null,
  edition: RulesEdition,
): Fail | null {
  // #1508 carried AC, #1510: `null` for a 2014 Paladin/Ranger (no Spellcasting
  // until level 2) or any non-caster — the "does not cast spells at level 1"
  // 400 below is the correct, intentional response rather than a silently
  // accepted pick count.
  const picks = level1SpellPicksFor(className, subclass, edition);
  if (picks == null) {
    return { ok: false, status: 400, error: `${classDisplay} does not cast spells at level 1` };
  }
  if (spells.cantripIds.length !== picks.cantrips) {
    return { ok: false, status: 400, error: `Expected ${picks.cantrips} cantrip(s), got ${spells.cantripIds.length}` };
  }
  if (spells.spellIds.length !== picks.spells) {
    return { ok: false, status: 400, error: `Expected ${picks.spells} level-1 spell(s), got ${spells.spellIds.length}` };
  }
  const allIds = [...spells.cantripIds, ...spells.spellIds];
  if (new Set(allIds).size !== allIds.length) {
    return { ok: false, status: 400, error: "A spell can be chosen only once" };
  }
  return null;
}

// Phase 2b — creation spell picks (#1131). A level-1 caster's chosen cantrips +
// prepared spells become prepared SpellEntry snapshots; every count/list/level is
// validated against the class's per-edition tables via one catalog read.
// Omitting `spells` yields a null book (back-compat); a non-caster sending
// `spells` is a 400. #1510: no ability scores needed here — level1SpellPicksFor
// is a fixed table per edition, not the ability-mod-driven ongoing prepared cap.
async function resolveCreationSpells(
  input: CreateCharacterBody,
  selections: ResolvedSelections,
): Promise<PhaseResult<{ spellEntries: SpellEntry[] | null }>> {
  const { spells } = input;
  if (!spells) return { ok: true, spellEntries: null };

  const classDisplay = selections.characterClass.name;
  const className = classDisplay.toLowerCase();
  const subclass = selections.subclassName;
  const { edition } = selections;
  const countError = creationSpellCountError(spells, className, classDisplay, subclass, edition);
  if (countError) return countError;

  const allIds = [...spells.cantripIds, ...spells.spellIds];
  const rows = allIds.length
    ? await prisma.spell.findMany({ where: { id: { in: allIds } }, include: SPELL_CLASS_MEMBERSHIP_SELECT })
    : [];
  // #1712: reject a submitted id that's provably the WRONG edition's fork —
  // see rejectCrossEditionSpellForks's own comment for why this doesn't
  // reject every 2014 pick just because today's catalog is 2024-tagged.
  const forkError = await rejectCrossEditionSpellForks(rows, edition);
  if (forkError) return { ok: false, status: 400, error: forkError };
  const byId = new Map(rows.map((r) => [r.id, { ...r, classes: classesOf(r) }]));
  const maxLevel = maxSpellLevelForClass(className, 1, subclass, edition);
  // #1631: a subclass chosen at level 1 (a 2014 Warlock's patron) may already
  // widen the choosable pool at creation — e.g. a 2014 Fiend Warlock's level-1
  // spells-known pick may be Burning Hands or Command, neither on the base
  // Warlock list.
  const expandedSpellIds = new Set(await loadSubclassSpellListExpansionIds(selections.subclassId, edition));

  const entries: SpellEntry[] = [];
  for (const [ids, kind] of [[spells.cantripIds, "cantrip"], [spells.spellIds, "spell"]] as const) {
    for (const id of ids) {
      const row = byId.get(id);
      const error = creationPickError(row, id, kind, className, classDisplay, maxLevel, expandedSpellIds);
      if (error) return error;
      entries.push(creationSpellEntry(row!));
    }
  }
  return { ok: true, spellEntries: entries };
}

// The `spells`-path validator for resolveSpeciesCantripGrant (Astral Fire,
// #1756): the pick must be a level-0 cantrip whose NAME is one of the spec's
// named options and not the wrong edition's fork. The sibling class-LIST path
// (High Elf) still runs creationPickError; this exists because "on the wizard
// list" and "one of these three named cantrips" are genuinely different rules.
async function speciesCantripListError(
  row: CreationSpellRow | undefined,
  id: string,
  spells: string[],
  edition: RulesEdition,
): Promise<Fail | null> {
  if (!row) return { ok: false, status: 400, error: `Unknown spell id: ${id}` };
  if (row.level !== 0) return { ok: false, status: 400, error: `${row.name} is not a cantrip` };
  if (!spells.includes(row.name)) {
    return { ok: false, status: 400, error: `speciesCantripId: ${row.name} is not one of this species' cantrip options` };
  }
  const forkError = await rejectCrossEditionSpellForks([row], edition);
  return forkError ? { ok: false, status: 400, error: forkError } : null;
}

// Phase 2c — species-granted cantrip (#1689 High Elf, #1756 Astral Fire). Two
// legal-pick rules by spec shape: a class LIST (High Elf) validates via the
// SAME creationPickError the class's own picks use (so "legal cantrip" can't
// diverge); a named SPELLS list (Astral Fire) validates via
// speciesCantripListError above. Marked source:"species" + the ability the
// player chose (Astral Fire) or the spec fixed (High Elf's Intelligence) — see
// SpellEntry's own comment for why that marker matters.
async function resolveSpeciesCantripGrant(
  input: CreateCharacterBody,
  spec: ChooseCantrip | null,
  existingEntries: SpellEntry[],
  edition: RulesEdition,
): Promise<PhaseResult<{ entry: SpellEntry | null }>> {
  const { speciesCantripId } = input;
  if (!spec) {
    if (speciesCantripId) {
      return { ok: false, status: 400, error: "speciesCantripId not allowed: this species has no cantrip choice" };
    }
    return { ok: true, entry: null };
  }
  if (!speciesCantripId) {
    return { ok: false, status: 400, error: "speciesCantripId required: this species grants a choice of cantrip" };
  }
  if (existingEntries.some((e) => e.spellId === speciesCantripId)) {
    return { ok: false, status: 400, error: "speciesCantripId duplicates a class-picked spell" };
  }
  const raw = await prisma.spell.findUnique({
    where: { id: speciesCantripId },
    include: SPELL_CLASS_MEMBERSHIP_SELECT,
  });
  const row = raw ? { ...raw, classes: classesOf(raw) } : undefined;
  const error = await speciesCantripPickError(row, speciesCantripId, spec, edition);
  if (error) return error;
  const entry: SpellEntry = { ...creationSpellEntry(row!), source: "species", castingAbility: spec.castingAbility ?? input.castingAbility };
  return { ok: true, entry };
}

// Dispatches a species cantrip pick to its spec's legal-pick rule: a named
// SPELLS set (Astral Fire) or a class LIST (High Elf). Split out of
// resolveSpeciesCantripGrant so neither carries both rules' branches.
async function speciesCantripPickError(
  row: CreationSpellRow | undefined,
  id: string,
  spec: ChooseCantrip,
  edition: RulesEdition,
): Promise<Fail | null> {
  if (spec.spells) return speciesCantripListError(row, id, spec.spells, edition);
  const classDisplay = spec.list!.charAt(0).toUpperCase() + spec.list!.slice(1);
  return creationPickError(row, id, "cantrip", spec.list!, classDisplay, 0);
}

// The "no chooseOriginFeat spec served" branch of resolveSpeciesOriginFeatGrant
// below — split out purely to keep that function's own cyclomatic/cognitive
// complexity under the repo's health gate, same reasoning as
// validateVariantSelection/resolveSpeciesCatalogRow above.
function speciesOriginFeatNotServedResult(speciesOriginFeatId: string | undefined): PhaseResult<{ entry: null }> {
  if (speciesOriginFeatId) {
    return { ok: false, status: 400, error: "speciesOriginFeatId not allowed: this species has no Origin feat choice" };
  }
  return { ok: true, entry: null };
}

type OriginFeatRow = NonNullable<Awaited<ReturnType<typeof prisma.feat.findUnique>>>;

// Validates a resolved Feat row is legal as a SPECIES-granted Origin feat pick:
// right edition, and — the one check buildOriginEntry's background path never
// needs (a background's Origin feat is baked from its own fixed FK, never a
// player-submitted id) — actually Origin category. Split out of
// resolveSpeciesOriginFeatGrant for the same complexity-gate reason as the
// helper above.
function validateOriginFeatRow(feat: OriginFeatRow, edition: RulesEdition): Fail | null {
  const mismatch = crossEditionRejection(feat, `Feat "${feat.name}"`, edition);
  if (mismatch) return { ok: false, status: 400, error: mismatch };
  if (feat.category !== "origin") {
    return { ok: false, status: 400, error: `speciesOriginFeatId: "${feat.name}" is not an Origin feat` };
  }
  return null;
}

// PHB'24: an Origin feat is normally taken once — the species pick may not
// repeat the background's own Origin feat unless the feat is explicitly
// printed repeatable (Magic Initiate, Skilled), in which case taking it twice
// (once from each grant) is the intended, legal way to gain it again.
// `backgroundOriginEntry` is `grants.originEntry` (resolveBackgroundGrants,
// `null` for a 2014 character or a background with no Origin feat) — the ONE
// place that entry's featId is compared against, so this rule can only ever
// see the SAME snapshot the background phase already committed to, never a
// second, independent re-resolution of it.
function originFeatDuplicateError(feat: OriginFeatRow, backgroundOriginEntry: AdvancementEntry | null): Fail | null {
  if (backgroundOriginEntry?.featId === feat.id && !feat.repeatable) {
    return {
      ok: false,
      status: 400,
      error: `speciesOriginFeatId: "${feat.name}" duplicates your background's Origin feat and is not repeatable`,
    };
  }
  return null;
}

// Builds the SAME slot-exempt snapshot AdvancementEntry shape buildOriginEntry
// bakes for the background's own Origin feat (origin: true, so
// applyRemoveAdvancement's guard and splitAdvancementsBySlotCap's slot
// exemption both apply with zero new logic) — just resolved from a
// player-chosen feat row instead of the background's fixed FK.
function buildSpeciesOriginFeatEntry(feat: OriginFeatRow): AdvancementEntry {
  return {
    id: randomUUID(),
    level: 1,
    kind: "feat",
    origin: true,
    abilityDeltas: {},
    hpDelta: 0,
    initDelta: 0,
    featId: feat.id,
    featName: feat.name,
    featDescription: feat.description,
    improvements: (feat.improvements as unknown as FeatImprovement[]) ?? [],
  };
}

// Phase 2d — species-granted Origin feat (#1690, 2024 Human's Versatile).
async function resolveSpeciesOriginFeatGrant(
  input: CreateCharacterBody,
  hasSpec: boolean,
  edition: RulesEdition,
  backgroundOriginEntry: AdvancementEntry | null,
): Promise<PhaseResult<{ entry: AdvancementEntry | null }>> {
  const { speciesOriginFeatId } = input;
  if (!hasSpec) return speciesOriginFeatNotServedResult(speciesOriginFeatId);
  if (!speciesOriginFeatId) {
    return { ok: false, status: 400, error: "speciesOriginFeatId required: this species grants a choice of Origin feat" };
  }
  const feat = await prisma.feat.findUnique({ where: { id: speciesOriginFeatId } });
  if (!feat) {
    return { ok: false, status: 400, error: `Unknown feat id: ${speciesOriginFeatId}` };
  }
  const rowError = validateOriginFeatRow(feat, edition);
  if (rowError) return rowError;
  const dupError = originFeatDuplicateError(feat, backgroundOriginEntry);
  if (dupError) return dupError;
  return { ok: true, entry: buildSpeciesOriginFeatEntry(feat) };
}

// The Origin feat(s) ride resources.advancements as slot-exempt entries
// (#1130) — an array, not a single entry: #1690 lets a character carry TWO at
// once (the background's own grant plus a species-chosen one, e.g. a 2024
// Human with a Soldier background). undefined when neither phase granted one
// (the column is left at its default).
function creationResources(originEntries: (AdvancementEntry | null)[]): Prisma.InputJsonValue | undefined {
  const entries = originEntries.filter((e): e is AdvancementEntry => e != null);
  if (entries.length === 0) return undefined;
  const state = normalizeResourcesMutable(null);
  state.advancements = entries;
  return serializeResourcesState(state);
}

// The mutable spellcasting blob for a caster's creation picks (all prepared),
// or Prisma's JSON-null sentinel for a non-caster / no picks (#1131).
function creationSpellcasting(spellEntries: SpellEntry[] | null): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (!spellEntries) return Prisma.JsonNull;
  return { slotsUsed: {}, arcanumUsed: {}, spells: spellEntries, concentratingOn: null } as unknown as Prisma.InputJsonValue;
}

// #1513 D-A: creation prepares the legal max, not every scribed spell — a
// Wizard's spellbook (6, level1SpellPicksFor's spellbookSize) can exceed its
// prepared cap (4 at INT 16), so the first `limit` leveled picks (in pick
// order) stay prepared:true and the rest are stored prepared:false.
// clampPreparedToLimit is the SAME "keep the first N" rule
// buildSpellcastingView's read-side clamp applies (#1127) — reusing it here
// means the stored blob equals the served view (trimmedCount 0 on every read)
// instead of an over-cap book permanently relying on the read-side fallback to
// trim it. Cantrips (level 0) are untouched by the clamp. For every non-Wizard,
// level-1 picks are already <= the limit, so this is a no-op and the stored
// blob is byte-identical to before. Split out of persistCreatedCharacter to
// keep that function's complexity under the repo's health gate.
function clampCreationSpellEntries(
  spellEntries: SpellEntry[] | null,
  primaryClassChoice: PrimaryClassChoice,
  selections: ResolvedSelections,
  effectiveScores: Record<string, number>,
): SpellEntry[] | null {
  if (!spellEntries) return null;
  const limit = derivePreparedSpellLimit(
    [{ name: primaryClassChoice.name, level: 1, subclass: selections.subclassName }],
    effectiveScores,
    selections.edition,
  );
  return clampPreparedToLimit(spellEntries, limit).spells;
}

// The species-granted cantrip entry (#1689), if any — provenance-only lookup
// (the actual grant already lives in spellEntries itself); split out purely
// to keep persistCreatedCharacter's own complexity under the repo's health gate.
function speciesCantripEntryOf(spellEntries: SpellEntry[] | null): SpellEntry | null {
  return spellEntries?.find((e) => e.source === "species") ?? null;
}

// #1679/#1681/#1684/#1689: the raceSelection.create payload — species/variant
// selection, the #1681 ability-increase provenance snapshot, and the #1689
// creation-choice provenance snapshot, all siblings on one row. Split out of
// persistCreatedCharacter purely to keep that function's own
// cyclomatic/cognitive complexity under the repo's health gate.
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
    // #1684: the display-name snapshot defaults from the resolved variant
    // (more specific) or the species itself — the flat Race model's own
    // `name` no longer exists as a separate input.
    name: speciesSelection.variantName ?? speciesSelection.speciesName,
    speciesId: speciesSelection.speciesId,
    variantId: speciesSelection.variantId,
    variantName: speciesSelection.variantName,
    // abilityBonuses is the #1681 provenance snapshot of exactly what
    // resolveSpeciesGrants applied (fixed + chosen) — [] for a 2024
    // character or a species with no increases in its merged spec.
    abilityBonuses: appliedIncreases as unknown as Prisma.InputJsonValue,
    // #1683: the 2024 lineage/legacy casting-ability choice, resolved by
    // resolveCastingAbility — null for a 2014 character or a species/variant
    // that grants no spells.
    castingAbility,
    // #1689: provenance snapshot of the species-granted creation choices,
    // sibling to abilityBonuses above — [] / null for every species with no
    // choice-bearing trait.
    speciesSkills: input.speciesSkills ?? [],
    speciesCantripName,
    // #1690: provenance snapshot of a species-granted Origin feat pick
    // (Human's Versatile) — sibling of speciesCantripName above. The
    // functional grant is the AdvancementEntry creationResources folds onto
    // resources.advancements, not this column.
    speciesOriginFeatName,
  };
}

// The three OPTIONAL top-level Character.create fields, each present only
// under its own condition — extracted so each ternary is its own function's
// decision point, not another one of persistCreatedCharacter's own (same
// complexity-gate reasoning as the two helpers above).
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

// Phase 3 — ability/HP seeding, spell/proficiency setup (deriveCreatedCharacter)
// and persistence. Returns just the new id; the route re-fetches + serializes.
async function persistCreatedCharacter(
  input: CreateCharacterBody,
  ownerId: string,
  selections: ResolvedSelections,
  equipment: MaterializedEquipment,
  spellEntries: SpellEntry[] | null,
  grants: BackgroundGrants,
  speciesGrants: SpeciesGrants,
  speciesOriginFeatEntry: AdvancementEntry | null,
  castingAbility: string | null,
): Promise<{ id: string }> {
  const { characterClass, background, primaryClassChoice } = selections;
  const { inventoryItemCreates, startingCurrency } = equipment;
  const { originEntry } = grants;
  // speciesGrants.effectiveScores is grants.effectiveScores with the #1681
  // species/variant increases folded on TOP (resolveSpeciesGrants took
  // grants.effectiveScores as its base) — the one effectiveScores this
  // function persists, so a 2024 character (species contributes nothing)
  // and a 2014 character (background contributes nothing) both bake from
  // the same final value with no separate code path.
  const { effectiveScores, appliedIncreases } = speciesGrants;

  // Background ability spread + species/variant ability increases are both
  // baked into effectiveScores BEFORE derivation so level-1 HP/initiative
  // reflect them for free — no reversible delta record (#1130, #1681).
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
      // The only write of rulesEdition (write-once, #1285). The `edition` local
      // that resolveSelections computed for the creation-time subclass gate
      // check isn't returned to its caller, so this re-derives it from the same
      // input by the same formula via DEFAULT_RULES_EDITION — that shared
      // constant is what keeps the two independent resolutions from drifting.
      // Written explicitly rather than left to the Prisma column default so
      // both sites name one literal.
      rulesEdition: input.rulesEdition ?? DEFAULT_RULES_EDITION,
      experiencePoints: input.experiencePoints ?? 0,
      abilityScores: effectiveScores,
      ...derived,
      ...resourcesField(resources),
      // toolProficiencies is ToolProficiencyEntry[] from srd/srd.ts; Prisma
      // expects InputJsonValue for Json columns — safe to cast here.
      toolProficiencies: derived.toolProficiencies as unknown as Prisma.InputJsonValue,
      // Override derived currency with starting gold if the gold path was chosen.
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

// POST /characters orchestrator: selection resolution → starting-equipment
// materialization → seeding + persistence. Returns just the new id; the route
// re-fetches with characterInclude and serializes.
export async function createCharacter(
  input: CreateCharacterBody,
  ownerId: string,
): Promise<CreateCharacterResult> {
  const selections = await resolveSelections(input);
  if (!selections.ok) return selections;

  // Re-derives the same edition resolveSelections used (DEFAULT_RULES_EDITION
  // is the shared constant that keeps the two independent resolutions from
  // drifting — same pattern as the rulesEdition write further down).
  const grants = await resolveBackgroundGrants(input, selections.background, input.rulesEdition ?? DEFAULT_RULES_EDITION);
  if (!grants.ok) return grants;

  // Species increases bake on TOP of the background spread (grants.effectiveScores)
  // rather than input.abilityScores directly — the two never both contribute in
  // practice (opposite-edition mechanics, speciesGrantsAbilityIncreases vs
  // backgroundGrantsAbilitySpread), but composing this way means a hypothetical
  // future homebrew edition mixing both still bakes correctly with no special case.
  // selections.edition (not a third DEFAULT_RULES_EDITION re-derivation): already
  // the resolved value resolveSelections computed, safe to reuse directly since
  // this call sits after that resolution, unlike resolveBackgroundGrants above.
  const speciesGrants = await resolveSpeciesGrants(input, selections.speciesSelection, selections.edition, grants.effectiveScores);
  if (!speciesGrants.ok) return speciesGrants;

  // #1683: the 2024 lineage/legacy casting-ability choice — independent of
  // speciesGrants (2014 ability increases) but resolved against the SAME
  // speciesSelection, so the two never disagree about which species/variant
  // was picked.
  const castingAbilityResult = await resolveCastingAbility(input, selections.speciesSelection, selections.speciesChoiceSpecs.chooseCantrip);
  if (!castingAbilityResult.ok) return castingAbilityResult;

  const equipment = await materializeStartingEquipment(
    input,
    selections.characterClass.id,
    selections.primaryClassChoice.name,
    // background is null for a homebrew/unresolved name (#1565) — the same
    // "allowed to miss a catalog anchor" shape resolveSelections already
    // documents for the background lookup itself.
    selections.background?.id ?? null,
    input.background,
    // Re-derives the same edition resolveSelections used, same reasoning as
    // grants above and the rulesEdition write below — resolveSelections'
    // `edition` local is scoped to that function, so this independently
    // recomputes it from the same formula rather than threading it through.
    input.rulesEdition ?? DEFAULT_RULES_EDITION,
    selections.creationToolProfs,
  );
  if (!equipment.ok) return equipment;

  const spells = await resolveCreationSpells(input, selections);
  if (!spells.ok) return spells;

  // #1689: the species-granted cantrip (High Elf), resolved independently of
  // the class's own creation picks above and merged after — a non-caster
  // species (Human, Hill Dwarf) never reaches this with a spec to satisfy,
  // and a species WITH a spec still needs it even when the class itself
  // casts no spells at all (a High Elf Fighter still gets its cantrip).
  const speciesCantrip = await resolveSpeciesCantripGrant(input, selections.speciesChoiceSpecs.chooseCantrip, spells.spellEntries ?? [], selections.edition);
  if (!speciesCantrip.ok) return speciesCantrip;
  const spellEntries = speciesCantrip.entry ? [...(spells.spellEntries ?? []), speciesCantrip.entry] : spells.spellEntries;

  // #1690: the species-granted Origin feat (2024 Human's Versatile), resolved
  // against grants.originEntry (the background's OWN Origin feat, already
  // committed above) so the duplicate-vs-background rule compares against
  // the SAME snapshot persistCreatedCharacter writes, never a second lookup.
  const speciesOriginFeat = await resolveSpeciesOriginFeatGrant(
    input,
    selections.speciesChoiceSpecs.chooseOriginFeat,
    selections.edition,
    grants.originEntry,
  );
  if (!speciesOriginFeat.ok) return speciesOriginFeat;

  const { id } = await persistCreatedCharacter(
    input,
    ownerId,
    selections,
    equipment,
    spellEntries,
    grants,
    speciesGrants,
    speciesOriginFeat.entry,
    castingAbilityResult.castingAbility,
  );
  return { ok: true, id };
}
