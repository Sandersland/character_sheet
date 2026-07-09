import { Prisma } from "../generated/prisma/client.js";
import { prisma } from "./prisma.js";
import {
  autoEquipSlot,
  buildInventoryCreateFromCatalog,
  catalogItemDetailInclude,
  selectAutoEquip,
} from "./inventory.js";
import { ALIGNMENTS, deriveCreatedCharacter, isKnownTool } from "./srd.js";
import { STARTING_EQUIPMENT } from "./starting-equipment.js";
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
type ResolvedBackground = Awaited<ReturnType<typeof prisma.background.findUnique>>;
type CreationToolProf = { name: string; source: "background" | "class" | "race" };
type PackageEquipment = Extract<
  NonNullable<CreateCharacterBody["startingEquipment"]>,
  { mode: "package" }
>;
type ClassEquipmentDef = NonNullable<(typeof STARTING_EQUIPMENT)[string]>;
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
    where: { name: { in: names } },
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

// Validate a subclass choice: it must belong to the chosen class and only
// classes that grant subclasses at level 1 can have one at creation. A legacy
// plain-string subclass (no id) is kept as-is for homebrew / pre-catalog data.
async function resolveSubclass(
  primaryClassChoice: PrimaryClassChoice,
  characterClass: ResolvedClass
): Promise<PhaseResult<{ subclassId: string | null; subclassName: string | null }>> {
  if (primaryClassChoice.subclassId) {
    const subclass = await prisma.subclass.findUnique({
      where: { id: primaryClassChoice.subclassId },
    });
    if (!subclass) {
      return { ok: false, status: 400, error: `Unknown subclass id: ${primaryClassChoice.subclassId}` };
    }
    if (subclass.classId !== characterClass.id) {
      return {
        ok: false,
        status: 400,
        error: `Subclass "${subclass.name}" does not belong to ${characterClass.name}`,
      };
    }
    if (characterClass.subclassLevel > 1) {
      return {
        ok: false,
        status: 400,
        error: `${characterClass.name} grants its subclass at level ${characterClass.subclassLevel}, not at creation (level 1)`,
      };
    }
    return { ok: true, subclassId: subclass.id, subclassName: subclass.name };
  }
  if (primaryClassChoice.subclass) {
    // Legacy: plain string subclass name with no id (homebrew / pre-catalog).
    return { ok: true, subclassId: null, subclassName: primaryClassChoice.subclass };
  }
  return { ok: true, subclassId: null, subclassName: null };
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

// Phase 1 — selection resolution: validate alignment + class count, resolve the
// race/class/background catalog anchors, and validate subclass + proficiencies.
async function resolveSelections(
  input: CreateCharacterBody
): Promise<PhaseResult<ResolvedSelections>> {
  if (!ALIGNMENTS.includes(input.alignment)) {
    return { ok: false, status: 400, error: `Unknown alignment: ${input.alignment}` };
  }
  if (!input.classes.length) {
    return { ok: false, status: 400, error: "At least one class is required" };
  }

  const primaryClassChoice = input.classes[0];

  // Sequential rather than Promise.all: the pg driver adapter's pool can
  // warn/queue when the same PrismaClient fires concurrent queries, and
  // these are cheap point-lookups, so there's no real cost to awaiting
  // each in turn.
  const race = await prisma.race.findUnique({ where: { name: input.race } });
  const characterClass = await prisma.characterClass.findUnique({
    where: { name: primaryClassChoice.name },
  });
  const background = await prisma.background.findUnique({ where: { name: input.background } });

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

  const subclass = await resolveSubclass(primaryClassChoice, characterClass);
  if (!subclass.ok) return subclass;

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
  };
}

// Validate a chosen-gold amount against the class's dice range.
function resolveStartingGold(
  gold: number,
  className: string
): PhaseResult<{ startingCurrency: { cp: number; sp: number; gp: number; pp: number } }> {
  const classDef = STARTING_EQUIPMENT[className];
  if (classDef) {
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

// Check a looked-up catalog item against an open-pick filter; null when it passes.
function openPickFilterError(
  catalogItem: { category: string; weaponDetail?: { weaponClass: string | null; weaponRange: string | null } | null } | null,
  pick: OpenPick,
  chosenName: string
): Fail | null {
  if (!catalogItem || catalogItem.category !== "weapon") {
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

// Validate one player open-pick (catalog lookup + filter) into a fixed ref.
async function validateOpenPick(chosenName: string, pick: OpenPick): Promise<PhaseResult<{ ref: FixedRef }>> {
  const catalogItem = await prisma.item.findUnique({
    where: { name: chosenName },
    include: { weaponDetail: true },
  });
  const error = openPickFilterError(catalogItem, pick, chosenName);
  if (error) return error;
  return { ok: true, ref: { catalogName: chosenName, quantity: pick.quantity ?? 1 } };
}

// Validate + collect the open-pick refs for one selected bundle.
async function collectOpenPickRefs(
  bundle: EquipmentBundle,
  sel: PackageSelection,
  groupIdx: number
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
    const pick = await validateOpenPick(providedPicks[pickIdx], openPicks[pickIdx]);
    if (!pick.ok) return pick;
    refs.push(pick.ref);
  }
  return { ok: true, refs };
}

// Validate one selected group (optionIndex in range) and collect its fixed +
// open-pick refs (packs expanded downstream).
async function collectGroupRefs(
  group: EquipmentGroup,
  sel: PackageSelection,
  groupIdx: number
): Promise<PhaseResult<{ refs: FixedRef[] }>> {
  if (sel.optionIndex < 0 || sel.optionIndex >= group.options.length) {
    return {
      ok: false,
      status: 400,
      error: `Equipment group ${groupIdx}: optionIndex ${sel.optionIndex} out of range (0–${group.options.length - 1})`,
    };
  }

  const bundle = group.options[sel.optionIndex];
  const openPickRefs = await collectOpenPickRefs(bundle, sel, groupIdx);
  if (!openPickRefs.ok) return openPickRefs;

  return { ok: true, refs: [...bundleFixedRefs(bundle), ...openPickRefs.refs] };
}

// Walk the class package groups, validating each selection and collecting the
// fixed catalog refs across all groups.
async function collectPackageRefs(
  se: PackageEquipment,
  classDef: ClassEquipmentDef
): Promise<PhaseResult<{ allFixedRefs: FixedRef[] }>> {
  if (se.selections.length !== classDef.groups.length) {
    return {
      ok: false,
      status: 400,
      error: `Expected ${classDef.groups.length} equipment selections, got ${se.selections.length}`,
    };
  }

  const allFixedRefs: FixedRef[] = [];
  for (let groupIdx = 0; groupIdx < classDef.groups.length; groupIdx++) {
    const group = await collectGroupRefs(classDef.groups[groupIdx], se.selections[groupIdx], groupIdx);
    if (!group.ok) return group;
    allFixedRefs.push(...group.refs);
  }
  return { ok: true, allFixedRefs };
}

// Re-resolve a package selection authoritatively against STARTING_EQUIPMENT and
// expand it into InventoryItem create payloads.
async function resolvePackageInventory(
  se: PackageEquipment,
  primaryClassName: string
): Promise<PhaseResult<{ inventoryItemCreates: InventoryCreate[] }>> {
  const classDef = STARTING_EQUIPMENT[primaryClassName];
  if (!classDef) {
    return {
      ok: false,
      status: 400,
      error: `No starting equipment package defined for class: ${primaryClassName}`,
    };
  }

  const refs = await collectPackageRefs(se, classDef);
  if (!refs.ok) return refs;

  const { inventoryCreates, error } = await resolveFixedItems(refs.allFixedRefs);
  if (error) return { ok: false, status: 400, error };
  return { ok: true, inventoryItemCreates: inventoryCreates };
}

// Phase 2 — starting-equipment materialization. Optional: omitting it yields an
// empty-inventory character. The gold path sets currency; the package path
// materializes InventoryItem payloads. Starting weapons/armor are auto-equipped
// so the in-session Attack picker isn't empty on a fresh sheet (issue #51).
async function materializeStartingEquipment(
  input: CreateCharacterBody,
  primaryClassName: string
): Promise<PhaseResult<MaterializedEquipment>> {
  let inventoryItemCreates: InventoryCreate[] = [];
  let startingCurrency: MaterializedEquipment["startingCurrency"];

  const se = input.startingEquipment;
  if (se?.mode === "gold") {
    const gold = resolveStartingGold(se.gold, primaryClassName);
    if (!gold.ok) return gold;
    startingCurrency = gold.startingCurrency;
  } else if (se) {
    const pkg = await resolvePackageInventory(se, primaryClassName);
    if (!pkg.ok) return pkg;
    inventoryItemCreates = pkg.inventoryItemCreates;
  }

  // The 5e selection rule lives in lib/ (selectAutoEquip); apply its decision
  // by assigning each chosen payload its paper-doll slot (#565).
  for (const idx of selectAutoEquip(inventoryItemCreates)) {
    inventoryItemCreates[idx].equippedSlot = autoEquipSlot(inventoryItemCreates[idx]);
  }

  return { ok: true, inventoryItemCreates, startingCurrency };
}

// Phase 3 — ability/HP seeding, spell/proficiency setup (deriveCreatedCharacter)
// and persistence. Returns just the new id; the route re-fetches + serializes.
async function persistCreatedCharacter(
  input: CreateCharacterBody,
  ownerId: string,
  selections: ResolvedSelections,
  equipment: MaterializedEquipment
): Promise<{ id: string }> {
  const { race, characterClass, background, primaryClassChoice } = selections;
  const { inventoryItemCreates, startingCurrency } = equipment;

  const derived = deriveCreatedCharacter(
    {
      abilityScores: input.abilityScores,
      skillProficiencies: selections.skillProficiencies,
      toolProficiencies: selections.creationToolProfs,
    },
    { race, characterClass }
  );

  const created = await prisma.character.create({
    data: {
      owner: { connect: { id: ownerId } },
      name: input.name,
      alignment: input.alignment,
      portraitUrl: input.portraitUrl ?? null,
      experiencePoints: input.experiencePoints ?? 0,
      abilityScores: input.abilityScores,
      ...derived,
      // toolProficiencies is ToolProficiencyEntry[] from srd.ts; Prisma
      // expects InputJsonValue for Json columns — safe to cast here.
      toolProficiencies: derived.toolProficiencies as unknown as Prisma.InputJsonValue,
      // Override derived currency with starting gold if the gold path was chosen.
      ...(startingCurrency ? { currency: startingCurrency } : {}),
      // Prisma represents an explicit JSON null distinctly from "field
      // omitted" — derived.spellcasting is the app-level `null`, swapped
      // here for the sentinel Prisma's Json column type expects.
      spellcasting: Prisma.JsonNull,
      raceSelection: { create: { name: input.race, raceId: race.id } },
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
        ? { inventoryItems: { create: inventoryItemCreates } }
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

  const equipment = await materializeStartingEquipment(input, selections.primaryClassChoice.name);
  if (!equipment.ok) return equipment;

  const { id } = await persistCreatedCharacter(input, ownerId, selections, equipment);
  return { ok: true, id };
}
