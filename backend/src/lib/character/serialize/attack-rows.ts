import { isItemActive } from "@/lib/inventory/capabilities.js";
import { deriveOffHandDamage, hasOffHandAbilityDamage } from "@/lib/srd/srd.js";
import type { AdvancementEntry } from "@/lib/classes/resources.js";
import type { AttackDamageRider, AttackRow } from "@character-sheet/shared-types";
import type { buildUnarmedAttacksView } from "./combat.js";
import type { serializeInventoryItem } from "./inventory.js";

type SerializedInventoryItem = ReturnType<typeof serializeInventoryItem>;
type UnarmedAttacksView = ReturnType<typeof buildUnarmedAttacksView>;

/** An inventory row already narrowed to "equipped weapon with a weapon view". */
type EquippedWeapon = SerializedInventoryItem & {
  weapon: NonNullable<SerializedInventoryItem["weapon"]>;
};

/**
 * Dice-valued on-hit riders from THIS item's active capabilities (Flame Tongue
 * +2d6 fire), scoped to the one item so another item's bonus can never leak into
 * its row. Only an additive dice-valued damage capability is a rider — a scalar,
 * a `setTo`, or a non-damage target is not.
 *
 * `isItemActive` is the gate, so an attunement-required item that is merely
 * equipped serves no riders (#1272: the client used to re-derive this).
 *
 * `index` is the position in the item's FULL capabilities list, not in the
 * filtered subset: rider ids are persisted as attack-tally `formId`s, so
 * renumbering them would orphan in-flight rows.
 */
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

// One equipped weapon's row, composed from the values serializeInventoryItem
// already derived — never re-derived here, which is what makes
// `attackSpec.modifier === inventory[].weapon.attackBonus` true by construction.
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
    },
  };
}

/**
 * The single Two-Weapon Fighting off-hand row (#732), or undefined when the
 * loadout holds fewer than two weapons. Prefers the weapon in the OFF_HAND
 * paper-doll slot, falling back to the second equipped weapon.
 *
 * Row presence is not action availability: a row is emitted whenever two weapons
 * are equipped, exactly as before. Whether the swing may be taken this turn is the
 * two-Light-weapons rule, identical in SRD 5.1 / PHB'14 p. 72 and SRD 5.2, and the
 * Two-Weapon Fighting style does NOT waive it (#1496) — it grants damage only, which
 * is exactly what `deriveOffHandDamage` below applies. The feature that would lift
 * the requirement is the Dual Wielder feat, unseeded here. Eligibility still belongs
 * to the gated action row (#1435) — no `light` logic here.
 *
 * `damageSpec.modifier` and `damageComponents` both come from the one
 * `deriveOffHandDamage` result, which is what keeps
 * `abilityMod + meleeDamageBonus === damageSpec.modifier` true on this row (#1235).
 */
function offHandRow(
  weapons: EquippedWeapon[],
  advancements: AdvancementEntry[],
): AttackRow | undefined {
  if (weapons.length < 2) return undefined;
  const item = weapons.find((w) => w.equippedSlot === "OFF_HAND") ?? weapons[1];
  const damage = deriveOffHandDamage(item.weapon.damage, hasOffHandAbilityDamage(advancements));
  const row = weaponRow(item);
  return {
    ...row,
    offHand: true,
    damageSpec: { ...row.damageSpec, modifier: damage.damageModifier },
    damageComponents: {
      abilityMod: damage.abilityModifier,
      meleeDamageBonus: damage.meleeDamageBonus,
    },
  };
}

// The unarmed/improvised rows restate the already-derived buildUnarmedAttacksView
// output as rows; both stay on the payload too, since other surfaces read them.
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

/**
 * Every way the character can swing, fully resolved (#1434) — see `AttackRow`.
 *
 * Composed from the ALREADY-SERIALIZED inventory rather than the Prisma rows, so
 * the numbers on a row are the same objects the sheet reads on
 * `inventory[].weapon` and cannot drift from them.
 *
 * Order is load-bearing (the turn sheet's main-weapon summary reads the first
 * row): equipped weapons in inventory order, then the off-hand row, then
 * unarmed, then improvised. Equipped weapons are emitted UN-deduped — collapsing
 * two Daggers into one card is a presentation choice the client still owns.
 */
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
