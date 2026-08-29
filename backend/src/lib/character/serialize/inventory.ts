import {
  serializeArmorDetail,
  serializeConsumableDetail,
  serializeWeaponDetail,
} from "@/lib/inventory/itemDetail.js";
import {
  deriveWeaponAttackComponents,
  deriveWeaponDamage,
  isProficientWithItem,
} from "@/lib/srd/srd.js";
import type { RollEventAttackComponents } from "@character-sheet/shared-types";
import {
  activatedMaxUses,
  chargePoolOf,
  describeActivatedReminder,
  describeAttunementPrereq,
  describeChargeRecharge,
  deriveItemGrants,
  readCapability,
  serializeCapability,
  type ActivatedEffectCapability,
} from "@/lib/inventory/capabilities.js";
import { itemBuffKey } from "@/lib/inventory/inventory.js";
import { isEquippable } from "@/lib/inventory/items.js";
import { allowedSlotsForItem } from "@/lib/inventory/inventory-placement.js";
import { normalizeActiveEffectsMutable } from "@/lib/combat/active-effects.js";
import type { CharacterWithRelations } from "@/lib/character/character-include.js";
import type { TargetModifierMap } from "./effects.js";
import type {
  buildMergedArmorProficiencies,
  buildMergedWeaponProficiencies,
  mergeItemWeaponProficiencies,
} from "./proficiencies.js";

interface InventoryItemContext {
  effectiveScores: Record<string, number>;
  proficiencyBonus: number;
  weaponGrants: ReadonlyArray<{ name: string }>;
  // weaponGrants PLUS item-granted weapon proficiencies (#529) — proficient (below) reads this, never weaponGrants, so it can't contradict the list beside it. deriveWeaponAttackComponents deliberately keeps the un-merged list — the two must stay separate fields (#1433).
  itemMergedWeaponGrants: ReadonlyArray<{ name: string }>;
  armorGrants: ReadonlyArray<{ category: string }>;
  /** Shield equipped or ≥2 weapons equipped — picks the versatile-weapon die (2H when off-hand free). */
  offHandBusy: boolean;
  /** Archery Fighting Style feat bonus (#1137) — +2 to ranged weapon attack rolls. */
  rangedAttackRollBonus: number;
  /** Sum of active "meleeDamage" buffs (#455); added to melee weapon damage. */
  meleeDamageBonus: number;
  /** Sum of active "attackRoll" buffs (#419, e.g. Sacred Weapon); added to weapon attack bonus. */
  attackRollBonus: number;
  /** Buff keys currently active — an activatedEffect item is "active" when its key is present (#543). */
  activeItemBuffKeys: Set<string>;
}

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

// equipped is DERIVED from placement — equippedSlot is the source of truth.
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
    attunementPrereqText: row.attunementPrereqKind
      ? describeAttunementPrereq({ kind: row.attunementPrereqKind, value: row.attunementPrereqValue })
      : undefined,
    // Eldritch Knight Weapon Bond (2014, #1854) — raw persisted flag, NOT clamped here (a per-item builder has no class/level/edition context) — the pool-driven Summon Bonded Weapon action is clamped in bondedWeaponCount.
    weaponBonded: row.weaponBonded,
    notes: row.notes ?? undefined,
  };
}

function buildInventoryWeaponView(
  row: CharacterWithRelations["inventoryItems"][number],
  context: InventoryItemContext,
):
  | (ReturnType<typeof serializeWeaponDetail> & {
      attackBonus: number;
      /** Decomposed addends of `attackBonus` — surfaced for the combat-log drill-in (#1235); sums to it by construction. */
      attackBonusComponents: RollEventAttackComponents;
      damage: ReturnType<typeof deriveWeaponDamage>;
    })
  | undefined {
  if (!row.weaponDetail) return undefined;
  const attackBonusComponents = deriveWeaponAttackComponents(
    {
      name: row.name,
      finesse: row.weaponDetail.finesse,
      weaponClass: row.weaponDetail.weaponClass,
      weaponRange: row.weaponDetail.weaponRange,
    },
    context.effectiveScores,
    context.proficiencyBonus,
    context.weaponGrants,
    context.rangedAttackRollBonus,
    context.attackRollBonus,
  );
  return {
    ...serializeWeaponDetail(row.weaponDetail),
    attackBonus:
      attackBonusComponents.abilityMod +
      attackBonusComponents.proficiencyBonus +
      attackBonusComponents.rangedBonus +
      attackBonusComponents.attackRollBonus,
    attackBonusComponents,
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

// equippable and allowedSlots are NOT the same rule and must not be collapsed: worn gear declaring a slot is placeable (allowedSlots: ["RING"]) but not equippable — that's what keeps the row's equip toggle off a ring while the loadout's RING picker still offers it.
function buildInventoryItemFlags(
  row: CharacterWithRelations["inventoryItems"][number],
  context: InventoryItemContext,
) {
  return {
    equippable: isEquippable(row.category),
    allowedSlots: allowedSlotsForItem(row),
    proficient: isProficientWithItem(
      {
        category: row.category,
        name: row.name,
        weaponClass: row.weaponDetail?.weaponClass,
        armorCategory: row.armorDetail?.armorCategory,
      },
      context.itemMergedWeaponGrants,
      context.armorGrants,
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
    ...buildInventoryItemFlags(row, context),
    weapon: buildInventoryWeaponView(row, context),
    armor: row.armorDetail ? serializeArmorDetail(row.armorDetail) : undefined,
    consumable: row.consumableDetail ? serializeConsumableDetail(row.consumableDetail) : undefined,
    capabilities: row.capabilities.length > 0 ? row.capabilities.map(serializeCapability) : undefined,
    activated: serializeActivatedEffect(row, context),
    charges: serializeChargePool(row),
  };
}

function serializeChargePool(row: CharacterWithRelations["inventoryItems"][number]) {
  const pool = chargePoolOf(row.capabilities);
  if (!pool) return undefined;
  return {
    max: pool.cap.maxCharges,
    remaining: Math.max(0, pool.cap.maxCharges - (pool.row.used ?? 0)),
    recharge: describeChargeRecharge(pool.cap),
  };
}

function serializeActivatedEffect(
  row: CharacterWithRelations["inventoryItems"][number],
  context: InventoryItemContext,
) {
  const cap = row.capabilities
    .map(readCapability)
    // Type-predicate, not a cast: a row with kind "activatedEffect" but no activation (readCapability's fallthrough) must NOT match, or the reminder string would drop the DM's label.
    .find((c): c is ActivatedEffectCapability => c.kind === "activatedEffect" && "activation" in c);
  if (!cap) return undefined;
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

// Off-hand is "busy" when any equipped item is a shield OR 2+ weapons are equipped — a lightweight heuristic that avoids a full main-hand/off-hand slot model.
export function buildInventoryContext(
  row: CharacterWithRelations,
  effectiveScores: Record<string, number>,
  proficiencyBonus: number,
  weaponGrants: ReturnType<typeof buildMergedWeaponProficiencies>,
  itemMergedWeaponGrants: ReturnType<typeof mergeItemWeaponProficiencies>,
  armorGrants: ReturnType<typeof buildMergedArmorProficiencies>,
  rangedAttackRollBonus: number,
  buffTargets: TargetModifierMap,
): InventoryItemContext {
  const equippedItems = row.inventoryItems.filter((i) => i.equippedSlot != null);
  const equippedShieldPresent = equippedItems.some(
    (i) => i.armorDetail?.armorCategory === "shield",
  );
  const equippedWeaponCount = equippedItems.filter((i) => i.category === "weapon").length;
  const offHandBusy = equippedShieldPresent || equippedWeaponCount >= 2;

  const meleeDamageBonus = (buffTargets.meleeDamage ?? []).reduce((sum, b) => sum + b.modifier, 0);
  const attackRollBonus = (buffTargets.attackRoll ?? []).reduce((sum, b) => sum + b.modifier, 0);

  const activeItemBuffKeys = new Set(normalizeActiveEffectsMutable(row.activeEffects).buffs.map((b) => b.key));

  return { effectiveScores, proficiencyBonus, weaponGrants, itemMergedWeaponGrants, armorGrants, offHandBusy, rangedAttackRollBonus, meleeDamageBonus, attackRollBonus, activeItemBuffKeys };
}

// resistances also feed the halve-damage flow at damage-apply time (#456).
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
