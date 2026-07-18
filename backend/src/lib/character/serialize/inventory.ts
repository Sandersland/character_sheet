import {
  serializeArmorDetail,
  serializeConsumableDetail,
  serializeWeaponDetail,
} from "@/lib/inventory/itemDetail.js";
import {
  deriveWeaponAttackBonus,
  deriveWeaponDamage,
  type FightingStyleKey,
} from "@/lib/srd/srd.js";
import {
  activatedMaxUses,
  chargePoolOf,
  describeActivatedReminder,
  describeChargeRecharge,
  deriveItemGrants,
  readCapability,
  serializeCapability,
  type ActivatedEffectCapability,
} from "@/lib/inventory/capabilities.js";
import { itemBuffKey } from "@/lib/inventory/inventory.js";
import { normalizeActiveEffectsMutable } from "@/lib/combat/active-effects.js";
import type { CharacterWithRelations } from "@/lib/character/character-include.js";
import type { TargetModifierMap } from "./effects.js";
import type { buildMergedWeaponProficiencies } from "./proficiencies.js";

interface InventoryItemContext {
  /** The character's effective ability scores (post-advancement-clamp). */
  effectiveScores: Record<string, number>;
  /** The character's proficiency bonus (derived from level). */
  proficiencyBonus: number;
  /** The character's merged weapon proficiency grants (class + race + feat). */
  weaponGrants: ReadonlyArray<{ name: string }>;
  /**
   * True when any equipped item occupies the off-hand: either an equipped
   * shield or ≥ 2 equipped weapons. Used by `deriveWeaponDamage` to resolve
   * the correct die for versatile weapons (2H die when off-hand is free).
   */
  offHandBusy: boolean;
  /**
   * The character's chosen Fighting Style (already clamped to null when the
   * character isn't entitled). Threaded into deriveWeaponAttackBonus so Archery
   * adds +2 to ranged weapon attacks.
   */
  fightingStyle: FightingStyleKey | null;
  /** Sum of active "meleeDamage" buffs (#455); added to melee weapon damage. */
  meleeDamageBonus: number;
  /** Sum of active "attackRoll" buffs (#419, e.g. Sacred Weapon); added to weapon attack bonus. */
  attackRollBonus: number;
  /** Buff keys currently active — an activatedEffect item is "active" when its key is present (#543). */
  activeItemBuffKeys: Set<string>;
}

// Catalog/description identity fields — the item-facts an inventory row
// snapshots regardless of category (weapon/armor/consumable/gear all have
// these; the category-specific detail block nests in separately below).
function buildInventoryItemIdentity(row: CharacterWithRelations["inventoryItems"][number]) {
  return {
    id: row.id,
    itemId: row.itemId ?? undefined,
    name: row.name,
    category: row.category,
    quantity: row.quantity,
    weight: row.weight ?? undefined,
    cost: row.cost ?? undefined,
    description: row.description ?? undefined,
  };
}

// Paper-doll placement (#565) + attunement (#545) state. `equipped` is
// DERIVED from placement — equippedSlot is the source of truth.
function buildInventoryItemPlacement(row: CharacterWithRelations["inventoryItems"][number]) {
  return {
    equipped: row.equippedSlot != null,
    equippedSlot: row.equippedSlot ?? undefined,
    slot: row.slot ?? undefined,
    rarity: row.rarity ?? undefined,
    attuned: row.attuned,
    requiresAttunement: row.requiresAttunement,
    attunementPrereqKind: row.attunementPrereqKind ?? undefined,
    attunementPrereqValue: row.attunementPrereqValue ?? undefined,
    notes: row.notes ?? undefined,
  };
}

// The weapon sub-object (detail snapshot + derived attackBonus/damage), or
// undefined for a non-weapon row.
function buildInventoryWeaponView(
  row: CharacterWithRelations["inventoryItems"][number],
  context: InventoryItemContext,
):
  | (ReturnType<typeof serializeWeaponDetail> & {
      attackBonus: number;
      damage: ReturnType<typeof deriveWeaponDamage>;
    })
  | undefined {
  if (!row.weaponDetail) return undefined;
  return {
    ...serializeWeaponDetail(row.weaponDetail),
    attackBonus: deriveWeaponAttackBonus(
      {
        name: row.name,
        finesse: row.weaponDetail.finesse,
        weaponClass: row.weaponDetail.weaponClass,
        weaponRange: row.weaponDetail.weaponRange,
      },
      context.effectiveScores,
      context.proficiencyBonus,
      context.weaponGrants,
      context.fightingStyle,
      context.attackRollBonus,
    ),
    damage: deriveWeaponDamage(
      {
        name: row.name,
        finesse: row.weaponDetail.finesse,
        weaponRange: row.weaponDetail.weaponRange,
        damageDiceCount: row.weaponDetail.damageDiceCount,
        damageDiceFaces: row.weaponDetail.damageDiceFaces,
        damageType: row.weaponDetail.damageType,
        versatileDiceCount: row.weaponDetail.versatileDiceCount,
        versatileDiceFaces: row.weaponDetail.versatileDiceFaces,
        twoHanded: row.weaponDetail.twoHanded,
      },
      context.offHandBusy,
      context.effectiveScores,
      context.meleeDamageBonus,
    ),
  };
}

export function serializeInventoryItem(
  row: CharacterWithRelations["inventoryItems"][number],
  context: InventoryItemContext,
) {
  return {
    ...buildInventoryItemIdentity(row),
    ...buildInventoryItemPlacement(row),
    weapon: buildInventoryWeaponView(row, context),
    armor: row.armorDetail ? serializeArmorDetail(row.armorDetail) : undefined,
    consumable: row.consumableDetail ? serializeConsumableDetail(row.consumableDetail) : undefined,
    capabilities: row.capabilities.length > 0 ? row.capabilities.map(serializeCapability) : undefined,
    activated: serializeActivatedEffect(row, context),
    charges: serializeChargePool(row),
  };
}

// Derives the item's shared charge-pool state (#555): max, remaining (derived,
// never stored), and the human recharge text for the pill's tooltip. Absent when
// the item has no well-formed charges capability.
function serializeChargePool(row: CharacterWithRelations["inventoryItems"][number]) {
  const pool = chargePoolOf(row.capabilities);
  if (!pool) return undefined;
  return {
    max: pool.cap.maxCharges,
    remaining: Math.max(0, pool.cap.maxCharges - (pool.row.used ?? 0)),
    recharge: describeChargeRecharge(pool.cap),
  };
}

// Derives the activate/deactivate control state for an item's activatedEffect
// capability (#543): remaining uses, active flag, and the reminder text. Absent
// when the item has no activatedEffect capability.
function serializeActivatedEffect(
  row: CharacterWithRelations["inventoryItems"][number],
  context: InventoryItemContext,
) {
  const cap = row.capabilities
    .map(readCapability)
    // Type-predicate (not a cast): an opaque row with kind "activatedEffect" but no
    // `activation` (readCapability's fallthrough) must NOT match — else the reminder
    // string would drop the DM's label. Require the field to be present.
    .find((c): c is ActivatedEffectCapability => c.kind === "activatedEffect" && "activation" in c);
  if (!cap) return undefined;
  // A charges-costed effect (#555) is bounded by the item's shared pool: "uses"
  // = how many activations the remaining charges afford (floor division), so
  // ActivateControl's readout and out-of-uses gating work unchanged.
  if (cap.resourceKind === "charges") {
    const pool = chargePoolOf(row.capabilities);
    const cost = Math.max(1, cap.chargeCost);
    const remaining = pool ? Math.max(0, pool.cap.maxCharges - (pool.row.used ?? 0)) : 0;
    return {
      activation: cap.activation,
      reminder: describeActivatedReminder(cap),
      maxUses: pool ? Math.floor(pool.cap.maxCharges / cost) : 0,
      remainingUses: Math.floor(remaining / cost),
      active: context.activeItemBuffKeys.has(itemBuffKey(row.id)),
      available: row.equippedSlot != null || row.attuned,
    };
  }
  const maxUses = activatedMaxUses(cap);
  return {
    activation: cap.activation,
    reminder: describeActivatedReminder(cap),
    maxUses,
    remainingUses: maxUses === null ? null : Math.max(0, maxUses - row.activatedUsesSpent),
    active: context.activeItemBuffKeys.has(itemBuffKey(row.id)),
    available: row.equippedSlot != null || row.attuned,
  };
}

// Off-hand state is computed once for the whole inventory so versatile weapons
// know whether to use their two-handed die. Off-hand is "busy" when any equipped
// item is a shield OR when 2+ weapons are equipped (two-weapon fighting) — the
// lightweight approach that avoids a full main-hand/off-hand slot model.
export function buildInventoryContext(
  row: CharacterWithRelations,
  effectiveScores: Record<string, number>,
  proficiencyBonus: number,
  weaponGrants: ReturnType<typeof buildMergedWeaponProficiencies>,
  fightingStyle: FightingStyleKey | null,
  buffTargets: TargetModifierMap,
): InventoryItemContext {
  const equippedItems = row.inventoryItems.filter((i) => i.equippedSlot != null);
  const equippedShieldPresent = equippedItems.some(
    (i) => i.armorDetail?.armorCategory === "shield",
  );
  const equippedWeaponCount = equippedItems.filter((i) => i.category === "weapon").length;
  const offHandBusy = equippedShieldPresent || equippedWeaponCount >= 2;

  // Sum "meleeDamage" contributions (Rage buff + item passiveBonus) — added to
  // melee weapon damage in deriveWeaponDamage, the same read path skills use (#455/#545).
  const meleeDamageBonus = (buffTargets.meleeDamage ?? []).reduce((sum, b) => sum + b.modifier, 0);
  // Sum "attackRoll" contributions (Sacred Weapon buff + item passiveBonus) — added
  // to weapon attack bonus (#419/#545).
  const attackRollBonus = (buffTargets.attackRoll ?? []).reduce((sum, b) => sum + b.modifier, 0);

  // Active-item buff keys — an activatedEffect item is "active" when its item:<id> buff is present.
  const activeItemBuffKeys = new Set(normalizeActiveEffectsMutable(row.activeEffects).buffs.map((b) => b.key));

  return { effectiveScores, proficiencyBonus, weaponGrants, offHandBusy, fightingStyle, meleeDamageBonus, attackRollBonus, activeItemBuffKeys };
}

// Item-granted traits (#529): resistances/immunities/conditionImmunities/
// advantages/proficiencies from active (equipped or attuned-when-required)
// items. Derived on read — nothing here is persisted. resistances also feed
// the #456 halve flow at damage-apply time (lib/combat/hitpoints.ts). The skill/save
// name Sets are pre-split for the proficiency merges below.
export function buildItemGrantsView(row: CharacterWithRelations): {
  itemGrants: ReturnType<typeof deriveItemGrants>;
  itemSkillProfs: Set<string>;
  itemSaveProfs: Set<string>;
} {
  const itemGrants = deriveItemGrants(
    row.inventoryItems.map((i) => ({
      name: i.name,
      equipped: i.equippedSlot != null,
      attuned: i.attuned,
      requiresAttunement: i.requiresAttunement,
      capabilities: i.capabilities,
    })),
  );
  const itemSkillProfs = new Set(
    itemGrants.proficiencies.filter((p) => p.profType === "skill").map((p) => p.value),
  );
  const itemSaveProfs = new Set(
    itemGrants.proficiencies.filter((p) => p.profType === "save").map((p) => p.value),
  );
  return { itemGrants, itemSkillProfs, itemSaveProfs };
}
