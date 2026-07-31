// Rows -> wire mapper for StartingEquipmentPackage (#1519/#1534) — the reader
// half of seed-starting-equipment.ts's writer (that file's openPickCreateInput
// /itemCreateInput are this module's inverse). ONE pure function, shared by
// both read sites (reference.ts, character-create.ts) so they cannot resolve
// a package's tree differently.
import { Prisma } from "@/generated/prisma/client.js";
import type {
  ClassStartingEquipment,
  EquipmentBundle,
  EquipmentChoiceGroup,
  FixedItemRef,
  OpenWeaponPick,
} from "@character-sheet/shared-types";

// Shared Prisma include shape, all the way down to items/openPicks.
// `orderBy: { position: "asc" }` at EVERY nesting level is load-bearing, not
// cosmetic: character-create.ts's collectGroupRefs indexes
// `group.options[sel.optionIndex]` POSITIONALLY, so a missing orderBy at any
// one level is a silent wrong-item bug, not a payload diff (#1545 already
// shipped this once).
export const EQUIPMENT_PACKAGE_INCLUDE = {
  groups: {
    orderBy: { position: "asc" },
    include: {
      options: {
        orderBy: { position: "asc" },
        include: {
          items: { orderBy: { position: "asc" } },
          openPicks: { orderBy: { position: "asc" } },
        },
      },
    },
  },
} satisfies Prisma.StartingEquipmentPackageInclude;

export type StartingEquipmentPackageRow = Prisma.StartingEquipmentPackageGetPayload<{
  include: typeof EQUIPMENT_PACKAGE_INCLUDE;
}>;

type RowGroup = StartingEquipmentPackageRow["groups"][number];
type RowOption = RowGroup["options"][number];
type RowItem = RowOption["items"][number];
type RowOpenPick = RowOption["openPicks"][number];

// quantity omitted when 1 (the wire default) — never round-trip a redundant
// `quantity: 1` that seed-starting-equipment.ts's itemCreateInput would then
// write straight back as the literal default.
function mapItem(item: RowItem): FixedItemRef {
  return item.quantity === 1
    ? { catalogName: item.catalogName }
    : { catalogName: item.catalogName, quantity: item.quantity };
}

// weaponClass/weaponRange (DB columns, named after ItemWeaponDetail per the
// schema's own comment) -> the wire's filter.weaponClass/filter.range — the
// ONE mapper that renames the second field; rename both sides together if you
// rename either. `filter` is ALWAYS emitted, even `{}`: StartingEquipmentEditor
// .tsx reads `pick.filter.weaponClass` unguarded, so an omitted filter would
// throw the first time an unfiltered open pick is authored (no seeded row
// exercises that yet).
function mapOpenPick(pick: RowOpenPick): OpenWeaponPick {
  return {
    label: pick.label,
    filter: {
      ...(pick.weaponClass ? { weaponClass: pick.weaponClass } : {}),
      ...(pick.weaponRange ? { range: pick.weaponRange } : {}),
    },
    ...(pick.quantity === 1 ? {} : { quantity: pick.quantity }),
  };
}

// items/openPicks omitted when empty, gold omitted when 0 (every 2014 option,
// and any 2024 option that grants none) — never a redundant `gold: 0` that
// seed-starting-equipment.ts's optionCreateInput would then write straight
// back as the literal default.
function mapOption(option: RowOption): EquipmentBundle {
  const items = option.items.map(mapItem);
  const openPicks = option.openPicks.map(mapOpenPick);
  return {
    label: option.label,
    ...(items.length ? { items } : {}),
    ...(openPicks.length ? { openPicks } : {}),
    ...(option.gold ? { gold: option.gold } : {}),
  };
}

function mapGroup(group: RowGroup): EquipmentChoiceGroup {
  return { label: group.label, options: group.options.map(mapOption) };
}

/** Rows -> wire (#1534): the one shape both read sites resolve a package through. */
export function mapStartingEquipmentPackage(pkg: StartingEquipmentPackageRow): ClassStartingEquipment {
  return {
    gold: { diceCount: pkg.goldDiceCount, diceFaces: pkg.goldDiceFaces, multiplier: pkg.goldMultiplier },
    groups: pkg.groups.map(mapGroup),
  };
}
