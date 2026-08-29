// #1519/#1534: the reader half of seed-starting-equipment.ts's openPickCreateInput/itemCreateInput writers. ONE pure function shared by both read sites so they cannot resolve a package's tree differently.
import { Prisma } from "@/generated/prisma/client.js";
import type {
  ClassStartingEquipment,
  EquipmentBundle,
  EquipmentChoiceGroup,
  FixedItemRef,
  OpenPick,
} from "@character-sheet/shared-types";

// #1545: `orderBy: { position: "asc" }` at EVERY nesting level is load-bearing — collectGroupRefs indexes `group.options[sel.optionIndex]` POSITIONALLY, so a missing orderBy at any level is a silent wrong-item bug, not a payload diff.
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

// quantity omitted when 1 (the wire default) — never round-trip a redundant `quantity: 1` back through itemCreateInput as a literal default.
function mapItem(item: RowItem): FixedItemRef {
  return item.quantity === 1
    ? { catalogName: item.catalogName }
    : { catalogName: item.catalogName, quantity: item.quantity };
}

// `filter` is ALWAYS emitted, even `{}`: StartingEquipmentEditor.tsx reads `pick.filter.weaponClass` unguarded, so an omitted filter would throw on an unfiltered open pick. weaponRange renames to filter.range — rename both sides together if you rename either.
function mapOpenPick(pick: RowOpenPick): OpenPick {
  return {
    label: pick.label,
    filter: {
      ...(pick.weaponClass ? { weaponClass: pick.weaponClass } : {}),
      ...(pick.weaponRange ? { range: pick.weaponRange } : {}),
      ...(pick.toolCategory ? { toolCategory: pick.toolCategory } : {}),
    },
    ...(pick.quantity === 1 ? {} : { quantity: pick.quantity }),
    ...(pick.boundToToolChoice ? { boundToToolChoice: true } : {}),
  };
}

// items/openPicks omitted when empty, gold omitted when 0 — never a redundant `gold: 0` round-tripped back through optionCreateInput as a literal default.
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

// #1564: jointly null, never partially — PHB'24 has no roll-for-gold rule at all, so NULL here means that truthfully rather than "roll zero gold".
function mapGold(pkg: StartingEquipmentPackageRow): ClassStartingEquipment["gold"] {
  if (pkg.goldDiceCount == null) return null;
  return { diceCount: pkg.goldDiceCount, diceFaces: pkg.goldDiceFaces!, multiplier: pkg.goldMultiplier! };
}

// #1534: the one shape both read sites resolve a package through.
export function mapStartingEquipmentPackage(pkg: StartingEquipmentPackageRow): ClassStartingEquipment {
  return {
    gold: mapGold(pkg),
    groups: pkg.groups.map(mapGroup),
  };
}
