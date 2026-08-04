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
import { subclassGateLevel } from "@/lib/leveling/effective-levels.js";
import { DEFAULT_RULES_EDITION } from "@/lib/rules/edition.js";
import { crossEditionRejection, resolveEditionRow, withEditionOrShared } from "@/lib/rules/catalog-edition.js";
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
type ResolvedRace = NonNullable<Awaited<ReturnType<typeof prisma.race.findUnique>>>;
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
type CreationToolProf = { name: string; source: "background" | "class" | "race" };
type PackageEquipment = Extract<
  NonNullable<CreateCharacterBody["startingEquipment"]>,
  { mode: "package" }
>;
type ClassEquipmentDef = ClassStartingEquipment;
type InventoryCreate = ReturnType<typeof buildInventoryCreateFromCatalog>;

type ResolvedSelections = {
  primaryClassChoice: PrimaryClassChoice;
  race: ResolvedRace;
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
  // #1679: the validated species/variant selection — [null, null, null] for a
  // legacy `race`-name-only creation (the compat-window default). Increases
  // are NOT applied this slice (#1681); persistCreatedCharacter only writes
  // the selection + variantName snapshot onto CharacterRace.
  speciesSelection: SpeciesSelection;
};

// #1679: the validated species/variant selection persisted onto
// CharacterRace, sibling to subclassId/subclassName above.
type SpeciesSelection = {
  speciesId: string | null;
  variantId: string | null;
  variantName: string | null;
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
  species: { name: string; variants: { id: string; name: string }[] },
  variantId: string | undefined,
): PhaseResult<{ variant: { id: string; name: string } | null }> {
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

type SpeciesCatalogRow = { id: string; name: string; variants: { id: string; name: string }[] };

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
    // Only id+name are read from variants here (existence + belongs-to checks);
    // Dragonborn alone pulls 10 rows each carrying abilityIncreases JSON.
    include: { variants: { select: { id: true, name: true } } },
  });
  if (!species) {
    return { ok: false, status: 400, error: `Unknown species id: ${speciesId}` };
  }
  const mismatch = crossEditionRejection(species, `Species "${species.name}"`, edition);
  if (mismatch) return { ok: false, status: 400, error: mismatch };
  return { ok: true, species };
}

// Resolves + validates the #1679 species/variant selection. `edition` is the
// same `resolveSelections`-computed local every other creation-time catalog
// lookup uses (the Character row doesn't exist yet, so there's no column to
// read via editionOf). Four rejection cases, matching the issue's AC: unknown
// species id and cross-edition species (resolveSpeciesCatalogRow above), a
// variant-bearing species missing its variantId, and a variantless species
// (or a cross-species variant) given one anyway (validateVariantSelection).
async function resolveSpeciesSelection(
  input: CreateCharacterBody,
  edition: RulesEdition,
): Promise<PhaseResult<SpeciesSelection>> {
  if (!input.speciesId) {
    if (input.variantId) {
      return { ok: false, status: 400, error: "variantId requires speciesId" };
    }
    return { ok: true, speciesId: null, variantId: null, variantName: null };
  }

  const catalogResult = await resolveSpeciesCatalogRow(input.speciesId, edition);
  if (!catalogResult.ok) return catalogResult;
  const { species } = catalogResult;

  const variantResult = validateVariantSelection(species, input.variantId);
  if (!variantResult.ok) return variantResult;

  return {
    ok: true,
    speciesId: species.id,
    variantId: variantResult.variant?.id ?? null,
    variantName: variantResult.variant?.name ?? null,
  };
}

// Validate player skill selections against the class/background pools.
function validateSkillChoices(
  skillProficiencies: string[],
  characterClass: ResolvedClass,
  background: ResolvedBackground
): Fail | null {
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
  return null;
}

// Validate the player's tool selections against the class toolChoices pool.
// Fixed grants come from background/class/race and are applied server-side.
function validateToolChoices(
  playerToolChoices: string[],
  characterClass: ResolvedClass
): Fail | null {
  if (playerToolChoices.length === 0) return null;

  const allowedToolChoices = new Set(characterClass.toolChoices);
  const invalidToolChoices = playerToolChoices.filter((t) => !allowedToolChoices.has(t));
  if (invalidToolChoices.length > 0) {
    return {
      ok: false,
      status: 400,
      error: `Invalid tool choices: ${invalidToolChoices.join(", ")}. Must be from the class's toolChoices list.`,
    };
  }
  if (!playerToolChoices.every((t) => isKnownTool(t))) {
    return { ok: false, status: 400, error: "Unknown tool name in toolChoices" };
  }
  if (playerToolChoices.length > characterClass.toolChoiceCount) {
    return {
      ok: false,
      status: 400,
      error: `Too many tool choices (max ${characterClass.toolChoiceCount})`,
    };
  }
  return null;
}

// Validate player skill + tool selections against the class/background pools
// and assemble the creation-fixed tool proficiencies from all fixed sources.
function resolveProficiencies(
  input: CreateCharacterBody,
  race: ResolvedRace,
  characterClass: ResolvedClass,
  background: ResolvedBackground
): PhaseResult<{ skillProficiencies: string[]; creationToolProfs: CreationToolProf[] }> {
  const skillProficiencies = input.skillProficiencies ?? [];
  const skillError = validateSkillChoices(skillProficiencies, characterClass, background);
  if (skillError) return skillError;

  // toolChoices in the request are the player's selections from the class
  // toolChoices pool (e.g. 3 instruments for Bard).
  const playerToolChoices = input.toolChoices ?? [];
  const toolError = validateToolChoices(playerToolChoices, characterClass);
  if (toolError) return toolError;

  // Assemble creation-fixed tool proficiencies from all three fixed sources.
  // toolChoices (player picks) count as a "class" source.
  const creationToolProfs: CreationToolProf[] = [
    ...(background?.toolProficiencies ?? []).map((name) => ({ name, source: "background" as const })),
    ...(characterClass.toolProficiencies ?? []).map((name) => ({ name, source: "class" as const })),
    ...(race.toolProficiencies ?? []).map((name) => ({ name, source: "race" as const })),
    ...playerToolChoices.map((name) => ({ name, source: "class" as const })),
  ];

  return { ok: true, skillProficiencies, creationToolProfs };
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

// Phase 1 — selection resolution: validate alignment + class count, resolve the
// race/class/background catalog anchors, and validate subclass + proficiencies.
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

  const race = await prisma.race.findUnique({ where: { name: input.race } });
  const characterClass = await prisma.characterClass.findUnique({
    where: { name: primaryClassChoice.name },
  });
  const backgroundCandidates = await prisma.background.findMany({
    where: withEditionOrShared({ name: input.background }, edition),
    include: { originFeat: true },
  });
  const background = resolveEditionRow(backgroundCandidates, edition) ?? null;

  // Mechanical derivation needs a catalog anchor for race + class. The
  // background only grants skill-proficiency choices (no mechanical
  // fields), so — unlike race/class — it's allowed to be homebrew: an
  // unresolved name is kept as-is with a null backgroundId rather than
  // rejected.
  if (!race) {
    return { ok: false, status: 400, error: `Unknown race: ${input.race}` };
  }
  if (!characterClass) {
    return { ok: false, status: 400, error: `Unknown class: ${primaryClassChoice.name}` };
  }

  const subclass = await resolveSubclass(primaryClassChoice, characterClass, edition);
  if (!subclass.ok) return subclass;

  const speciesSelection = await resolveSpeciesSelection(input, edition);
  if (!speciesSelection.ok) return speciesSelection;

  const proficiencies = resolveProficiencies(input, race, characterClass, background);
  if (!proficiencies.ok) return proficiencies;

  return {
    ok: true,
    primaryClassChoice,
    race,
    characterClass,
    background,
    subclassId: subclass.subclassId,
    subclassName: subclass.subclassName,
    skillProficiencies: proficiencies.skillProficiencies,
    creationToolProfs: proficiencies.creationToolProfs,
    edition,
    speciesSelection: {
      speciesId: speciesSelection.speciesId,
      variantId: speciesSelection.variantId,
      variantName: speciesSelection.variantName,
    },
  };
}

// A legal PHB'24 spread is +2/+1 (two abilities) or +1/+1/+1 (three) — always
// summing to 3.
function backgroundSpreadShapeValid(amounts: number[]): boolean {
  const sorted = [...amounts].sort((a, b) => a - b);
  const isTwoOne = sorted.length === 2 && sorted[0] === 1 && sorted[1] === 2;
  const isOneOneOne = sorted.length === 3 && sorted.every((a) => a === 1);
  return isTwoOne || isOneOneOne;
}

// Validates the spread: every bump is one of the background's three abilities,
// the shape is legal, and no resulting score tops the 20 cap (SRD 5.2).
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
  if (!backgroundSpreadShapeValid(entries.map(([, amount]) => amount))) {
    return { ok: false, status: 400, error: "backgroundAbilities must be +2/+1 (two abilities) or +1/+1/+1 (three abilities)" };
  }
  const over = entries.find(([ability, amount]) => (base[ability] ?? 10) + amount > ABILITY_CAP);
  if (over) {
    return { ok: false, status: 400, error: `backgroundAbilities: ${over[0]} would exceed ${ABILITY_CAP}` };
  }
  return null;
}

function applyBackgroundSpread(
  base: Record<string, number>,
  spread: Record<string, number> | undefined,
): Record<string, number> {
  const scores = { ...base };
  for (const [ability, amount] of Object.entries(spread ?? {})) {
    scores[ability] = (scores[ability] ?? 10) + amount;
  }
  return scores;
}

// Snapshots the background's Origin feat into a slot-exempt AdvancementEntry
// (#1130). Magic Initiate's granted class is folded into the description snapshot.
//
// Background.originFeatId is a single FK, fixed once at seed time to a
// representative row (the reference-display default — same "no character to
// resolve against" reasoning as reference.ts's subclassLevel hardcode). A
// character actually being CREATED has an edition, so re-resolve the feat by
// NAME against THIS character's edition (#1306) rather than trust whichever
// row got baked — Alert forks by edition, so a 2014 character creating with a
// background whose baked FK happens to point at the 2024 row must still land
// on the 2014 row. No fallback to the baked row on a miss: silently snapshotting
// the OTHER edition's mechanics into a permanent AdvancementEntry is exactly the
// contamination this function exists to prevent, so grant nothing rather than
// grant the wrong thing (unreachable today — every seeded origin feat has a
// null/shared row every edition can fall back to — but a knowingly-wrong write
// is still the wrong shape to leave in).
async function buildOriginEntry(background: ResolvedBackground, edition: RulesEdition): Promise<AdvancementEntry | null> {
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
async function resolveBackgroundGrants(
  input: CreateCharacterBody,
  background: ResolvedBackground,
  edition: RulesEdition,
): Promise<PhaseResult<BackgroundGrants>> {
  const spread = input.backgroundAbilities;
  const choices = background?.abilityChoices ?? [];

  if (spread) {
    if (choices.length === 0) {
      return { ok: false, status: 400, error: "backgroundAbilities not allowed: this background has no ability spread" };
    }
    const shapeError = validateBackgroundSpread(spread, choices, input.abilityScores);
    if (shapeError) return shapeError;
  }

  return {
    ok: true,
    effectiveScores: applyBackgroundSpread(input.abilityScores, spread),
    originEntry: await buildOriginEntry(background, edition),
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

type CreationSpellRow = NonNullable<Awaited<ReturnType<typeof prisma.spell.findFirst>>>;

// Validate one chosen catalog row against the class list and its expected level
// band (cantrip = level 0; leveled = 1..maxLevel). Null when the pick is legal.
function creationPickError(
  row: CreationSpellRow | undefined,
  id: string,
  kind: "cantrip" | "spell",
  className: string,
  classDisplay: string,
  maxLevel: number,
): Fail | null {
  if (!row) return { ok: false, status: 400, error: `Unknown spell id: ${id}` };
  if (kind === "cantrip" && row.level !== 0) {
    return { ok: false, status: 400, error: `${row.name} is not a cantrip` };
  }
  if (kind === "spell" && (row.level < 1 || row.level > maxLevel)) {
    return { ok: false, status: 400, error: `${row.name} is not a spell ${classDisplay} can learn at level 1 (max spell level: ${maxLevel})` };
  }
  if (!row.classes.includes(className)) {
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
  const rows = allIds.length ? await prisma.spell.findMany({ where: { id: { in: allIds } } }) : [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const maxLevel = maxSpellLevelForClass(className, 1, subclass, edition);

  const entries: SpellEntry[] = [];
  for (const [ids, kind] of [[spells.cantripIds, "cantrip"], [spells.spellIds, "spell"]] as const) {
    for (const id of ids) {
      const row = byId.get(id);
      const error = creationPickError(row, id, kind, className, classDisplay, maxLevel);
      if (error) return error;
      entries.push(creationSpellEntry(row!));
    }
  }
  return { ok: true, spellEntries: entries };
}

// The Origin feat rides resources.advancements as a slot-exempt entry (#1130);
// undefined when the background grants none (the column is left at its default).
function creationResources(originEntry: AdvancementEntry | null): Prisma.InputJsonValue | undefined {
  if (!originEntry) return undefined;
  const state = normalizeResourcesMutable(null);
  state.advancements = [originEntry];
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

// Phase 3 — ability/HP seeding, spell/proficiency setup (deriveCreatedCharacter)
// and persistence. Returns just the new id; the route re-fetches + serializes.
async function persistCreatedCharacter(
  input: CreateCharacterBody,
  ownerId: string,
  selections: ResolvedSelections,
  equipment: MaterializedEquipment,
  spellEntries: SpellEntry[] | null,
  grants: BackgroundGrants,
): Promise<{ id: string }> {
  const { race, characterClass, background, primaryClassChoice } = selections;
  const { inventoryItemCreates, startingCurrency } = equipment;
  const { effectiveScores, originEntry } = grants;

  // Background ability spread is baked into effectiveScores BEFORE derivation so
  // level-1 HP/initiative reflect it for free — no reversible delta record (#1130).
  const derived = deriveCreatedCharacter(
    {
      abilityScores: effectiveScores,
      skillProficiencies: selections.skillProficiencies,
      toolProficiencies: selections.creationToolProfs,
    },
    { race, characterClass }
  );

  const resources = creationResources(originEntry);
  const clampedSpellEntries = clampCreationSpellEntries(spellEntries, primaryClassChoice, selections, effectiveScores);

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
      ...(resources ? { resources } : {}),
      // toolProficiencies is ToolProficiencyEntry[] from srd/srd.ts; Prisma
      // expects InputJsonValue for Json columns — safe to cast here.
      toolProficiencies: derived.toolProficiencies as unknown as Prisma.InputJsonValue,
      // Override derived currency with starting gold if the gold path was chosen.
      ...(startingCurrency ? { currency: startingCurrency } : {}),
      spellcasting: creationSpellcasting(clampedSpellEntries),
      raceSelection: {
        create: {
          name: input.race,
          raceId: race.id,
          // #1679: additive alongside raceId above — null/null/null for a
          // legacy `race`-name-only creation. abilityBonuses stays [] this
          // slice (increases aren't applied until #1681); it's the
          // provenance snapshot of what WOULD be applied, not a default.
          speciesId: selections.speciesSelection.speciesId,
          variantId: selections.speciesSelection.variantId,
          variantName: selections.speciesSelection.variantName,
        },
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
      ...(inventoryItemCreates.length > 0
        ? { inventoryItems: { create: inventoryItemCreates.map(stripInventoryCreateForWrite) } }
        : {}),
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

  const { id } = await persistCreatedCharacter(input, ownerId, selections, equipment, spells.spellEntries, grants);
  return { ok: true, id };
}
