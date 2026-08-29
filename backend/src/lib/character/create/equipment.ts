import { prisma } from "@/lib/core/prisma.js";
import {
  autoEquipSlot,
  buildInventoryCreateFromCatalog,
  catalogItemDetailInclude,
  selectAutoEquip,
} from "@/lib/inventory/inventory.js";
import {
  mapStartingEquipmentPackage,
  EQUIPMENT_PACKAGE_INCLUDE,
} from "@/lib/inventory/starting-equipment-package.js";
import type { RulesEdition } from "@character-sheet/shared-types";
import type { CreateCharacterBody } from "@/lib/character/character-schemas.js";
import type {
  ClassEquipmentDef,
  CreationToolProf,
  Fail,
  InventoryCreate,
  MaterializedEquipment,
  PackageEquipment,
  PhaseResult,
} from "./shared.js";

async function resolveFixedItems(
  refs: { catalogName: string; quantity?: number }[]
): Promise<{ inventoryCreates: InventoryCreate[]; error?: string }> {
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
    // Pinned to the GLOBAL catalog (#1645) — an unpinned read could let a campaign row shadow the catalog item.
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

function bundleFixedRefs(bundle: EquipmentBundle): FixedRef[] {
  return (bundle.items ?? []).map((ref) => ({ catalogName: ref.catalogName, quantity: ref.quantity ?? 1 }));
}

type OpenPickCatalogItem = {
  name: string;
  category: string;
  toolCategory: string | null;
  weaponDetail?: { weaponClass: string | null; weaponRange: string | null } | null;
};

function toolCategoryFilterError(catalogItem: OpenPickCatalogItem, pick: OpenPick, chosenName: string): Fail | null {
  if (!pick.filter.toolCategory || catalogItem.toolCategory === pick.filter.toolCategory) return null;
  return {
    ok: false,
    status: 400,
    error: `Open pick "${chosenName}" does not satisfy filter: toolCategory must be "${pick.filter.toolCategory}"`,
  };
}

function boundToolChoiceError(chosenName: string, creationToolProfs: CreationToolProf[]): Fail | null {
  const isChosenToolProf = creationToolProfs.some((p) => p.name === chosenName);
  if (isChosenToolProf) return null;
  return {
    ok: false,
    status: 400,
    error: `Open pick "${chosenName}" is not one of this character's chosen tool proficiencies`,
  };
}

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

async function validateOpenPick(
  chosenName: string,
  pick: OpenPick,
  creationToolProfs: CreationToolProf[],
): Promise<PhaseResult<{ ref: FixedRef }>> {
  const catalogItem = await prisma.item.findUnique({
    // Pinned to the GLOBAL catalog (#1645) — an unpinned lookup could let a homebrew row shadow the catalog item a package meant.
    where: { scopeKey_name: { scopeKey: "global", name: chosenName } },
    include: { weaponDetail: true },
  });
  const error = openPickFilterError(catalogItem, pick, chosenName, creationToolProfs);
  if (error) return error;
  return { ok: true, ref: { catalogName: chosenName, quantity: pick.quantity ?? 1 } };
}

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

// Bundle gold is PHB'24's per-option GP; 0 for every 2014 option.
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

// Exact match, not resolveEditionRow: StartingEquipmentPackage.edition is non-nullable, so there's no shared/NULL row to fall back to (#1534).
async function loadClassEquipmentDef(classId: string, edition: RulesEdition): Promise<ClassEquipmentDef | null> {
  const row = await prisma.startingEquipmentPackage.findUnique({
    where: { classId_edition: { classId, edition } },
    include: EQUIPMENT_PACKAGE_INCLUDE,
  });
  return row ? mapStartingEquipmentPackage(row) : null;
}

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

// Class and background equipment GP amounts ADD, never overwrite (#1565).
// Starting weapons/armor auto-equip so the Attack picker isn't empty on a fresh sheet (#51).
export async function materializeStartingEquipment(
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
  // Omitting both equipment fields keeps deriveCreatedCharacter's default currency untouched.
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

  // Explicit even at 0 GP so a chosen package can't silently drop its currency (#1564).
  const startingCurrency = anyEquipmentChosen ? { cp: 0, sp: 0, gp: totalGold, pp: 0 } : undefined;

  for (const idx of selectAutoEquip(inventoryItemCreates)) {
    inventoryItemCreates[idx].equippedSlot = autoEquipSlot(inventoryItemCreates[idx]);
  }

  return { ok: true, inventoryItemCreates, startingCurrency };
}
