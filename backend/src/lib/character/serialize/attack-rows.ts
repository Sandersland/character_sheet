import { isItemActive } from "@/lib/inventory/capabilities.js";
import { deriveOffHandDamage, hasOffHandAbilityDamage } from "@/lib/srd/srd.js";
import type { AdvancementEntry } from "@/lib/classes/resources.js";
import type { AttackDamageRider, AttackRow } from "@character-sheet/shared-types";
import type { buildUnarmedAttacksView } from "./combat.js";
import type { serializeInventoryItem } from "./inventory.js";

type SerializedInventoryItem = ReturnType<typeof serializeInventoryItem>;
type UnarmedAttacksView = ReturnType<typeof buildUnarmedAttacksView>;

type EquippedWeapon = SerializedInventoryItem & {
  weapon: NonNullable<SerializedInventoryItem["weapon"]>;
};

// isItemActive is the gate — an attunement-required item that's merely equipped serves no riders.
// index is the position in the FULL capabilities list, not the filtered subset: rider ids are persisted as attack-tally formIds, so renumbering would orphan in-flight rows.
function itemDamageRiders(item: SerializedInventoryItem): AttackDamageRider[] {
  if (!isItemActive(item)) return [];
  const riders: AttackDamageRider[] = [];
  (item.capabilities ?? []).forEach((cap, index) => {
    if (cap.kind !== "passiveBonus" || cap.target !== "damage") return;
    if ((cap.op ?? "add") !== "add" || !cap.dice) return;
    riders.push({
      id: `${item.id}:rider:${index}`,
      spec: { count: cap.dice.count, faces: cap.dice.faces, modifier: 0 },
      ...(cap.dice.damageType ? { damageType: cap.dice.damageType } : {}),
      // Reminder text ("vs dragons"), never auto-applied: no enemy/target model.
      ...(cap.condition ? { condition: cap.condition } : {}),
    });
  });
  return riders;
}

function equippedWeapons(inventory: SerializedInventoryItem[]): EquippedWeapon[] {
  return inventory.filter(
    (item): item is EquippedWeapon =>
      item.category === "weapon" && item.equipped && item.weapon !== undefined,
  );
}

// Composed from values serializeInventoryItem already derived — never re-derived here, so attackSpec.modifier === inventory[].weapon.attackBonus by construction.
function weaponRow(item: EquippedWeapon): AttackRow {
  const { damage, attackBonus, attackBonusComponents } = item.weapon;
  return {
    id: item.id,
    kind: "weapon",
    name: item.name,
    attackSpec: { count: 1, faces: 20, modifier: attackBonus },
    damageSpec: {
      count: damage.damageDiceCount,
      faces: damage.damageDiceFaces,
      modifier: damage.damageModifier,
    },
    damageType: damage.damageType,
    grip: damage.grip,
    magical: false,
    offHand: false,
    damageRiders: itemDamageRiders(item),
    attackComponents: attackBonusComponents,
    damageComponents: {
      abilityMod: damage.abilityModifier,
      meleeDamageBonus: damage.meleeDamageBonus,
      ability: damage.ability,
    },
  };
}

// Two-Weapon Fighting off-hand row (#732) — undefined when fewer than two weapons are equipped; prefers the OFF_HAND slot, falling back to the second equipped weapon.
// Turn-availability (whether the swing may be taken at all) is the two-Light-weapons rule (SRD 5.1/PHB'14 p. 72, SRD 5.2) — the Fighting Style does NOT waive it (#1496); this file only serves the numbers (#1435).
// hasOffHandAbilityDamage (#1640) applies that same Light-weapons condition to whether the ability modifier is included, so the damage value here is already Light-correct.
// damageSpec.modifier and damageComponents both come from the one deriveOffHandDamage result, keeping abilityMod + meleeDamageBonus === damageSpec.modifier true (#1235).
function offHandRow(
  weapons: EquippedWeapon[],
  advancements: AdvancementEntry[],
): AttackRow | undefined {
  if (weapons.length < 2) return undefined;
  const item = weapons.find((w) => w.equippedSlot === "OFF_HAND") ?? weapons[1];
  const damage = deriveOffHandDamage(
    item.weapon.damage,
    hasOffHandAbilityDamage(advancements, weapons.map((w) => ({ light: w.weapon.light }))),
  );
  const row = weaponRow(item);
  return {
    ...row,
    offHand: true,
    damageSpec: { ...row.damageSpec, modifier: damage.damageModifier },
    damageComponents: {
      abilityMod: damage.abilityModifier,
      meleeDamageBonus: damage.meleeDamageBonus,
      ability: damage.ability,
    },
  };
}

function unarmedRow(unarmed: UnarmedAttacksView["unarmedStrike"]): AttackRow {
  return {
    id: "unarmed",
    kind: "unarmed",
    name: "Unarmed Strike",
    attackSpec: { count: 1, faces: 20, modifier: unarmed.attackBonus },
    damageSpec: {
      count: unarmed.damage.count,
      faces: unarmed.damage.faces,
      modifier: unarmed.damage.modifier,
    },
    damageType: unarmed.damage.damageType,
    magical: unarmed.magical,
    offHand: false,
    damageRiders: [],
  };
}

function improvisedRow(improvised: UnarmedAttacksView["improvisedWeapon"]): AttackRow {
  return {
    id: "improvised",
    kind: "improvised",
    name: "Improvised Weapon",
    attackSpec: { count: 1, faces: 20, modifier: improvised.attackBonus },
    damageSpec: {
      count: improvised.damage.count,
      faces: improvised.damage.faces,
      modifier: improvised.damage.modifier,
    },
    damageType: improvised.damage.damageType,
    magical: false,
    offHand: false,
    damageRiders: [],
  };
}

// Composed from the ALREADY-SERIALIZED inventory, so a row's numbers are the same objects the sheet reads off inventory[].weapon and cannot drift.
// Order is load-bearing (the turn sheet's main-weapon summary reads the first row): equipped weapons in inventory order, then off-hand, then unarmed, then improvised. Emitted UN-deduped — collapsing duplicates is a client-owned presentation choice.
export function buildAttackRowsView(
  inventory: SerializedInventoryItem[],
  { unarmedStrike, improvisedWeapon }: UnarmedAttacksView,
  advancements: AdvancementEntry[],
): AttackRow[] {
  const weapons = equippedWeapons(inventory);
  const offHand = offHandRow(weapons, advancements);
  return [
    ...weapons.map(weaponRow),
    ...(offHand ? [offHand] : []),
    unarmedRow(unarmedStrike),
    improvisedRow(improvisedWeapon),
  ];
}
