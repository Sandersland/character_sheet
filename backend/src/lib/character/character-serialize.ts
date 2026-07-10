import { Prisma } from "@/generated/prisma/client.js";
import { experienceProgress, levelForExperience } from "@/lib/experience.js";
import {
  serializeArmorDetail,
  serializeConsumableDetail,
  serializeWeaponDetail,
} from "@/lib/itemDetail.js";
import { normalizeHitDice, normalizeHitPoints } from "@/lib/hitpoints.js";
import {
  abilityModifier,
  advancementSlotsForLevel,
  CLASS_PROFICIENCY_GRANTS,
  deriveArmorClass,
  deriveArmorClassParts,
  deriveAttacksPerAction,
  deriveFastMovement,
  deriveFeatBonuses,
  deriveFeatProficiencies,
  deriveSpellcasting,
  deriveMulticlassSpellcasting,
  deriveImprovisedAttack,
  deriveUnarmedDamageDie,
  deriveUnarmedStrike,
  deriveUnarmoredMovement,
  deriveWeaponAttackBonus,
  deriveWeaponDamage,
  deriveFightingStyleBonuses,
  fightingStyleChoiceCount,
  RACE_PROFICIENCY_GRANTS,
  TOOLS,
  type ArmorProficiencyCategory,
  type BodyArmorCategory,
  type FightingStyleKey,
  type ToolProficiencyEntry,
} from "@/lib/srd/srd.js";
import { deriveResources } from "@/lib/classes/class-features.js";
import { deriveActions, type AvailableAction } from "@/lib/classes/actions.js";
import { normalizeResourcesMutable, type AdvancementEntry, type ToolProfEntry } from "@/lib/classes/resources.js";
import { normalizeConditionsMutable } from "@/lib/conditions.js";
import { buffsByTarget, normalizeActiveEffectsMutable, type ActiveBuff } from "@/lib/active-effects.js";
import {
  activatedMaxUses,
  chargePoolOf,
  describeActivatedReminder,
  describeChargeRecharge,
  deriveItemGrants,
  deriveItemPassiveBonuses,
  readCapability,
  serializeCapability,
  type ActivatedEffectCapability,
  type ItemPassiveContribution,
} from "@/lib/capabilities.js";
import { itemBuffKey } from "@/lib/inventory.js";
import { reverseAdvancementEffects } from "@/lib/advancement.js";
import { normalizeSpellcastingMutable } from "@/lib/spellcasting.js";
import type { SpellEntry } from "@/lib/spell-state.js";
import {
  deriveGrantedSpells,
  deriveGrantedCastingAbility,
  deriveItemSpells,
  type AbilityScores,
} from "@/lib/granted-spells.js";
import { SHADOW_ART_CONCENTRATION_PREFIX } from "@/lib/classes/shadow-arts.js";
import type { CharacterWithRelations } from "./character-include.js";

export function serializeCharacterSummary(row: {
  id: string;
  name: string;
  ownerId: string;
  campaignId: string | null;
  portraitUrl: string | null;
  experiencePoints: number;
  raceSelection: { name: string } | null;
  classEntries: { name: string; level: number }[];
}) {
  return {
    id: row.id,
    name: row.name,
    // Owning user id (legitimately persisted — see Character.ownerId in
    // schema.prisma). Access is enforced per-owner via assertCharacterAccess;
    // emitted here so the frontend can identify/display the owner.
    ownerId: row.ownerId,
    // Shared-campaign link (#246), or undefined — lets the campaign add-picker
    // exclude characters already in another campaign.
    campaignId: row.campaignId ?? undefined,
    // raceSelection/classEntries are optional in Prisma's types only
    // because they're the non-FK side of the relation — every character
    // created via POST /characters has exactly one of each.
    race: row.raceSelection?.name ?? "",
    class: row.classEntries[0]?.name ?? "",
    // All class entries (name + per-class level) so the card can render a
    // multiclass line ("Wizard 5 / Cleric 3"); `class` above stays the primary.
    classes: row.classEntries.map((e) => ({ name: e.name, level: e.level })),
    level: levelForExperience(row.experiencePoints),
    portraitUrl: row.portraitUrl ?? undefined,
  };
}

// Json columns (hitPoints, hitDice, abilityScores, skills, currency,
// spellcasting) are round-tripped as-is below — they were written
// by our own seed/PATCH/POST path, not external input, so they aren't
// re-validated against the frontend Character type's nested shapes here.
// (journal is no longer a Json column — it's the relational JournalEntry
// table, mutated only via routes/journal.ts and mapped to the wire shape below.)
// inventory is the exception: it's relational (InventoryItem rows, see
// schema.prisma), mapped into the same JSON shape the frontend already
// expects below. weaponDetail/armorDetail/consumableDetail (at most one
// present, matching `category`) nest as nullable `weapon`/`armor`/
// `consumable` sub-objects via the shared lib/itemDetail.js serializers
// (also used by routes/items.ts for the catalog) rather than flattening
// back out — `id`/the owning FK aren't meaningful to the client.

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

function serializeInventoryItem(
  row: CharacterWithRelations["inventoryItems"][number],
  context: InventoryItemContext,
) {
  let weapon:
    | (ReturnType<typeof serializeWeaponDetail> & {
        attackBonus: number;
        damage: ReturnType<typeof deriveWeaponDamage>;
      })
    | undefined;
  if (row.weaponDetail) {
    weapon = {
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

  return {
    id: row.id,
    itemId: row.itemId ?? undefined,
    name: row.name,
    category: row.category,
    quantity: row.quantity,
    weight: row.weight ?? undefined,
    cost: row.cost ?? undefined,
    description: row.description ?? undefined,
    // `equipped` is DERIVED from placement (#565) — equippedSlot is the source of truth.
    equipped: row.equippedSlot != null,
    equippedSlot: row.equippedSlot ?? undefined,
    slot: row.slot ?? undefined,
    rarity: row.rarity ?? undefined,
    attuned: row.attuned,
    requiresAttunement: row.requiresAttunement,
    attunementPrereqKind: row.attunementPrereqKind ?? undefined,
    attunementPrereqValue: row.attunementPrereqValue ?? undefined,
    notes: row.notes ?? undefined,
    weapon,
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

/**
 * Merges creation-fixed tool profs (Character.toolProficiencies column) with
 * level-gated subclass choices (toolProficienciesKnown from resources JSON)
 * into the single wire-format array the API emits.
 *
 * Dedup rule: creation-fixed entries win — they survive level-down and
 * the client should never show a duplicate proficiency row.
 */
function buildMergedToolProficiencies(
  stored: Prisma.JsonValue,
  subclassKnown: ToolProfEntry[],
): Array<{ name: string; category: string; source: string }> {
  const creationFixed = (Array.isArray(stored) ? stored : []) as unknown as ToolProficiencyEntry[];
  const fixedNames = new Set(creationFixed.map((e) => e.name));

  const merged = [
    ...creationFixed.map((e) => ({
      name: e.name,
      category: TOOLS.find((t) => t.name === e.name)?.category ?? "other",
      source: e.source,
    })),
    // Only add subclass entries that don't duplicate a creation-fixed grant.
    ...subclassKnown
      .filter((e) => !fixedNames.has(e.name))
      .map((e) => ({
        name: e.name,
        category: TOOLS.find((t) => t.name === e.name)?.category ?? "other",
        source: "subclass" as const,
      })),
  ];
  return merged;
}

/**
 * Merges armor proficiency grants from class(es), race, and feats into a
 * deduplicated list tagged with the highest-priority source (class > race > feat).
 *
 * Multiclass: iterates all classEntries and takes the full union of their grants.
 * This is a deliberate simplification of 5e's restricted multiclass-proficiency
 * rules (which restrict certain armor/weapon grants on secondary class pickup);
 * correct for the current single-class setup and conservatively permissive for
 * any future multiclass character.
 */
function buildMergedArmorProficiencies(
  classEntries: { name: string }[],
  raceName: string | undefined,
  featArmor: Set<string>,
): Array<{ category: ArmorProficiencyCategory; source: "class" | "race" | "feat" }> {
  const seen = new Set<string>();
  const out: Array<{ category: ArmorProficiencyCategory; source: "class" | "race" | "feat" }> = [];

  const push = (cat: string, source: "class" | "race" | "feat") => {
    if (seen.has(cat)) return;
    seen.add(cat);
    out.push({ category: cat as ArmorProficiencyCategory, source });
  };

  for (const entry of classEntries) {
    for (const cat of CLASS_PROFICIENCY_GRANTS[entry.name]?.armor ?? []) push(cat, "class");
  }
  if (raceName) {
    for (const cat of RACE_PROFICIENCY_GRANTS[raceName]?.armor ?? []) push(cat, "race");
  }
  for (const cat of featArmor) push(cat, "feat");

  return out;
}

/**
 * Merges weapon proficiency grants from class(es), race, and feats into a
 * deduplicated list tagged with the highest-priority source (class > race > feat).
 * Entries may be category-level ("Simple Weapons") or specific names ("Longswords").
 *
 * See buildMergedArmorProficiencies for the multiclass simplification note.
 */
function buildMergedWeaponProficiencies(
  classEntries: { name: string }[],
  raceName: string | undefined,
  featWeapons: Set<string>,
): Array<{ name: string; source: "class" | "race" | "feat" }> {
  const seen = new Set<string>();
  const out: Array<{ name: string; source: "class" | "race" | "feat" }> = [];

  const push = (name: string, source: "class" | "race" | "feat") => {
    if (seen.has(name)) return;
    seen.add(name);
    out.push({ name, source });
  };

  for (const entry of classEntries) {
    for (const w of CLASS_PROFICIENCY_GRANTS[entry.name]?.weapons ?? []) push(w, "class");
  }
  if (raceName) {
    for (const w of RACE_PROFICIENCY_GRANTS[raceName]?.weapons ?? []) push(w, "race");
  }
  for (const w of featWeapons) push(w, "feat");

  return out;
}

// Append item-granted weapon proficiencies (#529) after class/race/feat grants,
// tagged source "item". Deduped by name — an existing grant wins (never demoted).
function mergeItemWeaponProficiencies(
  base: Array<{ name: string; source: "class" | "race" | "feat" | "item" }>,
  itemProfs: { value: string; source: string }[],
): Array<{ name: string; source: "class" | "race" | "feat" | "item" }> {
  const seen = new Set(base.map((e) => e.name));
  const out = [...base];
  for (const p of itemProfs) {
    if (seen.has(p.value)) continue;
    seen.add(p.value);
    out.push({ name: p.value, source: "item" });
  }
  return out;
}

// Append item-granted tool proficiencies (#529) after the merged creation/subclass
// tools, tagged source "item". Deduped by name — an existing entry wins.
function mergeItemToolProficiencies(
  base: Array<{ name: string; category: string; source: string }>,
  itemProfs: { value: string; source: string }[],
): Array<{ name: string; category: string; source: string }> {
  const seen = new Set(base.map((e) => e.name));
  const out = [...base];
  for (const p of itemProfs) {
    if (seen.has(p.value)) continue;
    seen.add(p.value);
    out.push({ name: p.value, category: TOOLS.find((t) => t.name === p.value)?.category ?? "other", source: "item" });
  }
  return out;
}

type PrimaryClass = CharacterWithRelations["classEntries"][number] | undefined;

// Merge derived subclass-granted spells after the stored spells, dropping any
// grant whose name matches a stored entry (the player's learned copy wins).
function mergeGrantedSpells(stored: SpellEntry[], granted: SpellEntry[]): SpellEntry[] {
  if (granted.length === 0) return stored;
  const storedNames = new Set(stored.map((s) => s.name.toLowerCase()));
  return [...stored, ...granted.filter((g) => !storedNames.has(g.name.toLowerCase()))];
}

// Subclass-granted spells across every class entry (each gated by its own level).
function collectGrantedSpells(entries: CharacterWithRelations["classEntries"]): SpellEntry[] {
  return entries.flatMap((e) => deriveGrantedSpells(e.name, e.subclass ?? undefined, e.level));
}

// Item-granted spells (#528) for a holder's active items. Appended after learned
// + subclass-granted spells; their `item:` ids are a disjoint space so no name dedup.
function deriveItemSpellsFor(row: CharacterWithRelations): SpellEntry[] {
  return deriveItemSpells(
    row.inventoryItems.map((i) => ({
      id: i.id,
      name: i.name,
      // #565: `equipped` is derived from equippedSlot (no persisted boolean).
      equipped: i.equippedSlot != null,
      attuned: i.attuned,
      capabilities: i.capabilities,
    })),
  );
}

// Casting ability for the slotless multiclass view — from the first entry that
// actually grants a spell (defaults to Wisdom when none do).
function collectGrantedCastingAbility(entries: CharacterWithRelations["classEntries"]): keyof AbilityScores {
  const granting = entries.find(
    (e) => deriveGrantedSpells(e.name, e.subclass ?? undefined, e.level).length > 0,
  );
  return deriveGrantedCastingAbility(granting?.subclass ?? undefined);
}

// Clamp-on-read for concentration: surface the stored entry when it's a current
// spellbook spell OR a Shadow Art (its entryId carries the shadow-art: prefix, a
// disjoint id space); drop stale entries (e.g. a forgotten spellbook spell).
function resolveConcentration(
  concentratingOn: { entryId: string; spellName: string } | null,
  spells: { id: string }[],
): { entryId: string; spellName: string } | null {
  if (!concentratingOn) return null;
  if (
    concentratingOn.entryId.startsWith(SHADOW_ART_CONCENTRATION_PREFIX) ||
    spells.some((s) => s.id === concentratingOn.entryId)
  ) {
    return concentratingOn;
  }
  return null;
}

// Spellcasting clamp-on-read: derive stats (ability/DC/attack/slot totals) from
// class+level+scores, then layer the stored mutable state (slotsUsed, spells,
// concentration) clamped to the derived caps. Same derive-don't-persist pattern
// as level/proficiencyBonus. Returns undefined for non-casters.
function buildSpellcastingView(
  row: CharacterWithRelations,
  primaryClass: PrimaryClass,
  level: number,
  abilityScores: Record<string, number>,
  proficiencyBonus: number,
): object | undefined {
  // Multiclass (2+ entries): merge caster levels into one slot pool and surface
  // Warlock Pact Magic separately (per the #123 derivation). Single-class output
  // is left byte-for-byte identical via the primary-class path below.
  if (row.classEntries.length > 1) {
    return buildMulticlassSpellcastingView(row, abilityScores, proficiencyBonus);
  }

  const derivedSpell = deriveSpellcasting(
    primaryClass?.name ?? "",
    level,
    abilityScores,
    proficiencyBonus,
    primaryClass?.subclass ?? undefined,
  );

  // Subclass-granted spells (derived, never persisted). Single-class uses the
  // XP-derived level since the per-class column can be stale.
  const granted = deriveGrantedSpells(
    primaryClass?.name ?? "",
    primaryClass?.subclass ?? undefined,
    level,
  );
  // Item-granted spells (#528) — surfaced for any holder, caster or not.
  const itemSpells = deriveItemSpellsFor(row);

  if (derivedSpell) {
    const stored = normalizeSpellcastingMutable(row.spellcasting);
    const spells = [...mergeGrantedSpells(stored.spells, granted), ...itemSpells];
    return {
      ability: derivedSpell.ability,
      spellSaveDC: derivedSpell.spellSaveDC,
      spellAttackBonus: derivedSpell.spellAttackBonus,
      slots: derivedSpell.slotTotals.map(({ level: slotLevel, total }) => ({
        level: slotLevel,
        total,
        // Clamp used to total in case stored value is stale (e.g. after a
        // class change or long rest that wasn't captured in the old blob).
        used: Math.min(total, stored.slotsUsed[String(slotLevel)] ?? 0),
      })),
      // Warlock Mystic Arcanum charges (empty for every other caster). Same
      // clamp-on-read as slots.
      arcana: derivedSpell.arcana.map(({ level: arcanumLevel, total }) => ({
        level: arcanumLevel,
        total,
        used: Math.min(total, stored.arcanumUsed[String(arcanumLevel)] ?? 0),
      })),
      spells,
      // Active concentration spell, or null. Clamp-on-read drops a stale entry
      // (spellbook spell forgotten / Shadow Arts no longer available).
      concentratingOn: resolveConcentration(stored.concentratingOn, spells),
    };
  }
  // Non-caster class that nonetheless gets a subclass-granted spell (e.g. a Way
  // of Shadow monk's Minor Illusion). Surface a slotless view so the grant
  // renders; the casting ability is derived per rule (Wisdom is the default).
  if (granted.length > 0 || itemSpells.length > 0) {
    const stored = normalizeSpellcastingMutable(row.spellcasting);
    const castingAbility = deriveGrantedCastingAbility(primaryClass?.subclass ?? undefined);
    const abilMod = abilityModifier(abilityScores[castingAbility] ?? 10);
    const grantedSpells = [...mergeGrantedSpells(stored.spells, granted), ...itemSpells];
    return {
      ability: castingAbility,
      spellSaveDC: 8 + proficiencyBonus + abilMod,
      spellAttackBonus: proficiencyBonus + abilMod,
      slots: [],
      arcana: [],
      spells: grantedSpells,
      // A cast concentration Shadow Art (catalog-id entry) surfaces here so the
      // ShadowArtsSection handoff banner + concentrating badge can render.
      concentratingOn: resolveConcentration(stored.concentratingOn, grantedSpells),
    };
  }
  if (
    row.spellcasting !== null &&
    row.spellcasting !== undefined &&
    Array.isArray((row.spellcasting as { slots?: unknown }).slots)
  ) {
    // Fallback only for an already well-formed serialized blob (has `slots`).
    // The compact mutable format ({ slotsUsed, spells }) that a non-caster or
    // partial caster may have persisted is NOT renderable — leave spellcasting
    // undefined so SpellsSection is skipped (Journal card renders instead of
    // crashing with slots.filter on undefined).
    // This branch is currently inert for real data (no Warlock/Paladin/Ranger
    // serialized blobs exist), but guards future half/third-caster additions.
    return row.spellcasting as object;
  }
  return undefined;
}

// Multiclass spellcasting view: combined slot pool + separate Pact Magic, built
// from every class entry (not just the primary) so a caster in any slot renders.
function buildMulticlassSpellcastingView(
  row: CharacterWithRelations,
  abilityScores: Record<string, number>,
  proficiencyBonus: number,
): object | undefined {
  const multi = deriveMulticlassSpellcasting(
    row.classEntries.map((e) => ({ name: e.name, level: e.level, subclass: e.subclass })),
    abilityScores,
    proficiencyBonus,
  );

  // Subclass-granted spells across every class entry (each gated by its own level).
  const granted = collectGrantedSpells(row.classEntries);
  const itemSpells = deriveItemSpellsFor(row);
  const stored = normalizeSpellcastingMutable(row.spellcasting);

  // No caster class in the mix, but a subclass or item still grants a spell —
  // surface a slotless view (ability derived per rule; mirrors the single-class branch).
  if (multi.classes.length === 0) {
    if (granted.length === 0 && itemSpells.length === 0) return undefined;
    const castingAbility = collectGrantedCastingAbility(row.classEntries);
    const abilMod = abilityModifier(abilityScores[castingAbility] ?? 10);
    const grantedSpells = [...mergeGrantedSpells(stored.spells, granted), ...itemSpells];
    return {
      ability: castingAbility,
      spellSaveDC: 8 + proficiencyBonus + abilMod,
      spellAttackBonus: proficiencyBonus + abilMod,
      slots: [],
      arcana: [],
      spells: grantedSpells,
      concentratingOn: resolveConcentration(stored.concentratingOn, grantedSpells),
    };
  }

  const primaryCaster = multi.classes[0];
  const mergedSpells = [...mergeGrantedSpells(stored.spells, granted), ...itemSpells];
  return {
    ability: primaryCaster.ability,
    spellSaveDC: primaryCaster.spellSaveDC,
    spellAttackBonus: primaryCaster.spellAttackBonus,
    slots: multi.slotTotals.map(({ level: slotLevel, total }) => ({
      level: slotLevel,
      total,
      used: Math.min(total, stored.slotsUsed[String(slotLevel)] ?? 0),
    })),
    arcana: multi.arcana.map(({ level: arcanumLevel, total }) => ({
      level: arcanumLevel,
      total,
      used: Math.min(total, stored.arcanumUsed[String(arcanumLevel)] ?? 0),
    })),
    // Warlock Pact Magic, kept out of the merged pool (PHB p. 164). Null for a
    // multiclass character with no warlock levels.
    pact: multi.pact
      ? {
          slotLevel: multi.pact.slotLevel,
          count: multi.pact.count,
          used: Math.min(multi.pact.count, stored.slotsUsed[String(multi.pact.slotLevel)] ?? 0),
          spellSaveDC: multi.pact.spellSaveDC,
          spellAttackBonus: multi.pact.spellAttackBonus,
        }
      : null,
    // Per-class caster stats (ability/DC/attack) for display in a multiclass sheet.
    classes: multi.classes,
    spells: mergedSpells,
    concentratingOn: resolveConcentration(stored.concentratingOn, mergedSpells),
  };
}

// Resources clamp-on-read: derive class/subclass pools + level-gated caps, then
// layer stored `used` counts and known lists (clamped to caps). Also resolves
// the Fighting Style clamp (null when the character isn't entitled). Returns the
// resources view (undefined for classes with no pools) plus the clamped
// fightingStyle + its choice count, both reused elsewhere in serializeCharacter.
function buildResourcesView(
  row: CharacterWithRelations,
  primaryClass: PrimaryClass,
  level: number,
  abilityScores: Record<string, number>,
  proficiencyBonus: number,
): { resources: object | undefined; fightingStyle: FightingStyleKey | null; fightingStyleChoiceCount: number } {
  const derivedRes = deriveResources(
    primaryClass?.name ?? "",
    primaryClass?.subclass ?? undefined,
    level,
    abilityScores,
    proficiencyBonus,
  );

  // ── Fighting Style clamp-on-read ──────────────────────────────────────────
  // The chosen style key is persisted in resources.fightingStyle. Clamp it to
  // null when the character is no longer entitled (e.g. class change / level
  // drop) — defense-in-depth mirroring reconcileFightingStyle on the write side.
  const fightingStyleChoices = fightingStyleChoiceCount(primaryClass?.name ?? "", level);
  const storedFightingStyle = normalizeResourcesMutable(row.resources).fightingStyle;
  const fightingStyle: FightingStyleKey | null =
    fightingStyleChoices > 0 ? storedFightingStyle : null;

  let resources: object | undefined;
  if (derivedRes) {
    const stored = normalizeResourcesMutable(row.resources);
    // Clamp level-gated lists to their derived cap (defense-in-depth for
    // characters who haven't had a reconciling XP op since their level dropped).
    const clampedManeuversKnown =
      derivedRes.maneuverChoiceCount !== undefined
        ? stored.maneuversKnown.slice(0, derivedRes.maneuverChoiceCount)
        : stored.maneuversKnown;
    const clampedToolProfsKnown =
      derivedRes.toolProfChoiceCount !== undefined
        ? stored.toolProficienciesKnown.slice(0, derivedRes.toolProfChoiceCount)
        : stored.toolProficienciesKnown;
    const clampedDisciplinesKnown =
      derivedRes.disciplineChoiceCount !== undefined
        ? stored.disciplinesKnown.slice(0, derivedRes.disciplineChoiceCount)
        : stored.disciplinesKnown;
    resources = {
      features: derivedRes.features,
      maneuverChoiceCount: derivedRes.maneuverChoiceCount,
      maneuverSaveDC: derivedRes.maneuverSaveDC,
      toolProfChoiceCount: derivedRes.toolProfChoiceCount,
      disciplineChoiceCount: derivedRes.disciplineChoiceCount,
      disciplineSaveDC: derivedRes.disciplineSaveDC,
      shadowArtsAvailable: derivedRes.shadowArtsAvailable,
      cloakOfShadowsAvailable: derivedRes.cloakOfShadowsAvailable,
      pools: derivedRes.resources.map((pool) => ({
        key: pool.key,
        label: pool.label,
        total: pool.total,
        die: pool.die,
        recharge: pool.recharge,
        description: pool.description,
        used: Math.min(pool.total, stored.used[pool.key] ?? 0),
        remaining: pool.total - Math.min(pool.total, stored.used[pool.key] ?? 0),
      })),
      maneuversKnown: clampedManeuversKnown,
      disciplinesKnown: clampedDisciplinesKnown,
      toolProficienciesKnown: clampedToolProfsKnown,
      // Fighting Style choice surface for the frontend picker. Choice count is
      // level-gated (Fighter L1 -> 1); fightingStyle is already clamped to null
      // when the character isn't entitled.
      fightingStyleChoiceCount: fightingStyleChoices,
      fightingStyle,
    };
  }

  return { resources, fightingStyle, fightingStyleChoiceCount: fightingStyleChoices };
}

// Advancement clamp-on-read: mirrors reconcile-on-write in
// level-reconciliation.ts. When stored advancements exceed the level-derived
// slot count, cap them and reverse the excess to compute effective ability
// scores / HP / initiative for display (without writing). Returns the clamped
// list + slot total + the effective values.
function applyAdvancementClamp(
  row: CharacterWithRelations,
  primaryClass: PrimaryClass,
  level: number,
  hitPoints: ReturnType<typeof normalizeHitPoints>,
): {
  effectiveScores: Record<string, number>;
  hitPoints: ReturnType<typeof normalizeHitPoints>;
  effectiveInitBonus: number;
  clampedAdvancements: AdvancementEntry[];
  advSlotTotal: number;
} {
  const storedForAdv = normalizeResourcesMutable(row.resources);
  const advSlotTotal = advancementSlotsForLevel(primaryClass?.name ?? "", level);
  let effectiveScores = row.abilityScores as Record<string, number>;
  let effectiveInitBonus = row.initiativeBonus;
  let effectiveHitPoints = hitPoints;
  const clampedAdvancements = storedForAdv.advancements.slice(0, advSlotTotal);

  if (clampedAdvancements.length < storedForAdv.advancements.length) {
    // Some advancements are beyond the cap — reverse the excess ones to compute
    // effective display values (without writing; reconcile-on-write handles that).
    const excess = storedForAdv.advancements.slice(advSlotTotal);
    const reversed = reverseAdvancementEffects(
      effectiveScores,
      effectiveHitPoints,
      effectiveInitBonus,
      excess,
    );
    effectiveScores = reversed.scores;
    effectiveHitPoints = reversed.hitPoints;
    effectiveInitBonus = reversed.initiativeBonus;
  }

  return { effectiveScores, hitPoints: effectiveHitPoints, effectiveInitBonus, clampedAdvancements, advSlotTotal };
}

// Feat improvement modifier layer: sum structured feat improvements over the
// in-cap advancements. Because clampedAdvancements already excludes over-cap
// feats, level-down behavior is automatic — no separate reversal code needed.
// perLevel bonuses (e.g. Tough) scale with hitDiceTotal (applied level).
function applyFeatLayer(
  clampedAdvancements: AdvancementEntry[],
  hitDiceTotal: number,
  maxHp: number,
): {
  featBonuses: ReturnType<typeof deriveFeatBonuses>;
  effectiveMaxHp: number;
  featProficiencies: ReturnType<typeof deriveFeatProficiencies>;
} {
  const featBonuses = deriveFeatBonuses(clampedAdvancements, hitDiceTotal);
  const effectiveMaxHp = maxHp + featBonuses.maxHp;
  // Proficiency grants from feats (skills + saving throws). Merged with stored
  // proficiencies by the caller using OR — existing proficiency is never removed.
  const featProficiencies = deriveFeatProficiencies(clampedAdvancements);
  return { featBonuses, effectiveMaxHp, featProficiencies };
}

// Off-hand state is computed once for the whole inventory so versatile weapons
// know whether to use their two-handed die. Off-hand is "busy" when any equipped
// item is a shield OR when 2+ weapons are equipped (two-weapon fighting) — the
// lightweight approach that avoids a full main-hand/off-hand slot model.
function buildInventoryContext(
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

// The per-target modifier channel both skills and weapon math read: active cast
// buffs (buffsByTarget) merged with active-item scalar passiveBonus contributions
// (#545). Keyed the same way (skill name / meleeDamage / attackRoll) so item
// bonuses and buffs sum together.
type TargetModifierMap = Record<string, Array<{ modifier: number; source: string; condition?: string }>>;

function mergeTargetModifiers(
  buffTargets: Record<string, ActiveBuff[]>,
  contributions: ItemPassiveContribution[],
): TargetModifierMap {
  const out: TargetModifierMap = {};
  for (const [key, buffs] of Object.entries(buffTargets)) {
    out[key] = buffs.map((b) => ({ modifier: b.modifier, source: b.source }));
  }
  for (const c of contributions) {
    (out[c.target] ??= []).push({
      modifier: c.modifier,
      source: c.source,
      ...(c.condition ? { condition: c.condition } : {}),
    });
  }
  return out;
}

// The per-target modifier channel for one character: active cast buffs merged
// with active-item scalar passiveBonus contributions (#545), keyed by target
// (skill name / meleeDamage / attackRoll / ac / speed / …).
function buildTargetModifiers(
  row: CharacterWithRelations,
  activeEffects: ReturnType<typeof normalizeActiveEffectsMutable>,
): TargetModifierMap {
  const itemPassiveBonuses = deriveItemPassiveBonuses(
    row.inventoryItems.map((i) => ({
      name: i.name,
      equipped: i.equippedSlot != null,
      attuned: i.attuned,
      capabilities: i.capabilities,
    })),
  );
  return mergeTargetModifiers(buffsByTarget(activeEffects), itemPassiveBonuses);
}

// Item-granted traits (#529): resistances/immunities/conditionImmunities/
// advantages/proficiencies from active (equipped or attuned-when-required)
// items. Derived on read — nothing here is persisted. resistances also feed
// the #456 halve flow at damage-apply time (lib/hitpoints.ts). The skill/save
// name Sets are pre-split for the proficiency merges below.
function buildItemGrantsView(row: CharacterWithRelations): {
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

// The best equipped body armor snapshot (or null when unarmored) in the shape
// deriveArmorClassParts consumes.
type BestBodyArmor = Parameters<typeof deriveArmorClassParts>[0];

// AC is derived, not persisted: best equipped body armor + Dex (per category)
// + shield. The BODY slot holds one body armor (#565), so "best" is defensive.
// bestArmor/hasShield also feed speed (Unarmored/Fast Movement) and the Monk
// unarmed strike, so they're selected once here and threaded to those builders.
function selectEquippedBodyArmor(
  row: CharacterWithRelations,
  effectiveScores: Record<string, number>,
): { bestArmor: BestBodyArmor; hasShield: boolean } {
  const equippedArmorDetails = row.inventoryItems
    .filter((i) => i.equippedSlot != null && i.armorDetail)
    .map((i) => ({ name: i.name, ...i.armorDetail! }));
  const hasShield = equippedArmorDetails.some((a) => a.armorCategory === "shield");
  const dexMod = abilityModifier(effectiveScores.dexterity ?? 10);
  const bestArmor = equippedArmorDetails
    .filter((a): a is (typeof equippedArmorDetails)[number] & { armorCategory: BodyArmorCategory } => a.armorCategory !== "shield")
    .reduce<BestBodyArmor>((best, a) => {
      const candidate = {
        name: a.name,
        armorCategory: a.armorCategory,
        baseArmorClass: a.baseArmorClass,
        dexModifierMax: a.dexModifierMax,
      };
      if (best === null) return candidate;
      return deriveArmorClass(candidate, false, dexMod) > deriveArmorClass(best, false, dexMod)
        ? candidate
        : best;
    }, null);
  return { bestArmor, hasShield };
}

// AC assembly: labeled addends whose exact sum is armorClass (single source of
// the base formula in srd/srd.ts). Layered in order: base parts (armor/Dex/shield/
// Unarmored Defense/Mage Armor best-of) → Defense fighting style → feat AC →
// per-source "ac" buffs → the acFloor (Barkskin) reconciling part last.
// The branchiness is inherent to the 5e AC layering (each optional source is a
// conditional addend), not accidental complexity — it was previously inlined in
// serializeCharacter's body; extracting it here is a net structural win.
// fallow-ignore-next-line complexity
function buildArmorClassView(
  row: CharacterWithRelations,
  effectiveScores: Record<string, number>,
  bestArmor: BestBodyArmor,
  hasShield: boolean,
  fightingStyle: FightingStyleKey | null,
  featBonuses: ReturnType<typeof deriveFeatBonuses>,
  buffTargets: TargetModifierMap,
): { armorClass: number; armorClassBreakdown: ReturnType<typeof deriveArmorClassParts> } {
  const dexMod = abilityModifier(effectiveScores.dexterity ?? 10);
  // Feeds Unarmored Defense (Barbarian/Monk) when no body armor is equipped.
  const unarmoredDefense = {
    classNames: row.classEntries.map((e) => e.name),
    conMod: abilityModifier(effectiveScores.constitution ?? 10),
    wisMod: abilityModifier(effectiveScores.wisdom ?? 10),
  };
  // Mage Armor (#363): a spell buff sets the unarmored base to 13 + Dex — the
  // highest-valued `acUnarmoredBase` buff becomes a best-of candidate in the
  // unarmored formula (ignored while wearing body armor; the equip hook true-ends it).
  const mageArmor = (buffTargets.acUnarmoredBase ?? []).reduce<{ label: string; value: number } | undefined>(
    (best, c) => (best && best.value >= c.modifier ? best : { label: c.source, value: c.modifier }),
    undefined,
  );
  // Labeled AC addends; armorClass below is their exact sum (single source in srd/srd.ts).
  const acParts = deriveArmorClassParts(bestArmor, hasShield, dexMod, unarmoredDefense, mageArmor);
  // Defense fighting style only applies while wearing body armor (5e).
  const styleAc = bestArmor !== null ? deriveFightingStyleBonuses(fightingStyle).armorClass : 0;
  if (styleAc !== 0) acParts.push({ label: "Defense fighting style", value: styleAc });
  if (featBonuses.armorClass !== 0) acParts.push({ label: "Feats", value: featBonuses.armorClass });
  // Active-item AC bonuses (#383) + flat AC spell buffs (Shield of Faith +2, #363):
  // each labeled per source. v1 applies only unconditional bonuses; a conditional
  // one surfaces as reminder text (value 0) rather than being silently added.
  for (const c of buffTargets.ac ?? []) {
    if (c.condition) acParts.push({ label: c.source, value: 0, reminder: c.condition });
    else acParts.push({ label: c.source, value: c.modifier });
  }
  // Barkskin (#363): AC can't drop below the floor while active — applied last,
  // stacking over armor/Dex/buffs. Kept in the breakdown as a reconciling part so
  // the labeled parts still sum to armorClass (a 0-value reminder when AC already
  // meets the floor). Highest floor wins if several are active.
  const acFloor = (buffTargets.acFloor ?? []).reduce<{ source: string; value: number } | undefined>(
    (best, c) => (best && best.value >= c.modifier ? best : { source: c.source, value: c.modifier }),
    undefined,
  );
  if (acFloor) {
    const subtotal = acParts.reduce((total, p) => total + p.value, 0);
    if (subtotal < acFloor.value) {
      acParts.push({ label: `${acFloor.source} (floor ${acFloor.value})`, value: acFloor.value - subtotal });
    } else {
      acParts.push({ label: acFloor.source, value: 0, reminder: `floor ${acFloor.value}` });
    }
  }
  return {
    armorClass: acParts.reduce((total, p) => total + p.value, 0),
    armorClassBreakdown: acParts,
  };
}

// Per-class level lookup (0 when the class isn't in the mix) — multiclass-safe
// inputs for the class-level-scaled speed/unarmed terms.
function classEntryLevel(row: CharacterWithRelations, className: string): number {
  return row.classEntries.find((e) => e.name.toLowerCase() === className)?.level ?? 0;
}

// Speed is the persisted racial base plus additive terms only (never merged
// into each other): feat speed bonuses, Monk Unarmored Movement (monk class
// level, unarmored & unshielded), Barbarian Fast Movement (barbarian class
// level 5+, not in heavy armor), and any active "speed"-targeted buff
// (e.g. Boots of Speed, #543).
function buildSpeedView(
  row: CharacterWithRelations,
  bestArmor: BestBodyArmor,
  hasShield: boolean,
  featBonuses: ReturnType<typeof deriveFeatBonuses>,
  buffTargets: TargetModifierMap,
): number {
  const unarmoredMovementBonus = deriveUnarmoredMovement({
    monkLevel: classEntryLevel(row, "monk"),
    isUnarmored: bestArmor === null,
    hasShield,
  });
  const fastMovementBonus = deriveFastMovement({
    barbarianLevel: classEntryLevel(row, "barbarian"),
    wearingHeavyArmor: bestArmor?.armorCategory === "heavy",
  });
  return (
    row.speed +
    featBonuses.speed +
    unarmoredMovementBonus +
    fastMovementBonus +
    (buffTargets["speed"] ?? []).reduce((sum, b) => sum + b.modifier, 0)
  );
}

// Unarmed strike + improvised weapon rows. Derived from the same clamped
// advancements slice so Tavern Brawler's upgrades are automatically excluded
// when the character is over-cap. A Monk (unarmored & unshielded) swaps in
// max(Dex, Str) + the level-scaled Martial Arts die, off the monk class-entry
// level for multiclass correctness.
function buildUnarmedAttacksView(
  row: CharacterWithRelations,
  effectiveScores: Record<string, number>,
  proficiencyBonus: number,
  clampedAdvancements: AdvancementEntry[],
  weaponGrants: ReadonlyArray<{ name: string }>,
  bestArmor: BestBodyArmor,
  hasShield: boolean,
): { unarmedStrike: ReturnType<typeof deriveUnarmedStrike>; improvisedWeapon: ReturnType<typeof deriveImprovisedAttack> } {
  const unarmedDie = deriveUnarmedDamageDie(clampedAdvancements);
  const unarmedStrike = deriveUnarmedStrike(effectiveScores, proficiencyBonus, unarmedDie, {
    level: classEntryLevel(row, "monk"),
    isUnarmored: bestArmor === null,
    hasShield,
  });
  const improvisedProficient = weaponGrants.some((g) => g.name === "Improvised Weapons");
  const improvisedWeapon = deriveImprovisedAttack(
    effectiveScores,
    proficiencyBonus,
    improvisedProficient,
  );
  return { unarmedStrike, improvisedWeapon };
}

// Merge feat- and item-granted saving throw proficiencies (OR with the
// class-fixed stored set; deduped via Set round-trip). Returns the stored
// array untouched when there's nothing to merge.
function buildSavingThrowProficiencies(
  stored: string[],
  featSaves: Set<string>,
  itemSaveProfs: Set<string>,
): string[] {
  return featSaves.size > 0 || itemSaveProfs.size > 0
    ? [...new Set([...stored, ...featSaves, ...itemSaveProfs])]
    : stored;
}

// Merge feat/item-granted skill proficiencies (proficient stays true if already
// true; grants only add) and overlay any active buff as an optional
// tempModifier + labeled breakdown (#438). Additive term, derived on read.
function buildSkillsView(
  row: CharacterWithRelations,
  featProficiencies: ReturnType<typeof deriveFeatProficiencies>,
  itemSkillProfs: Set<string>,
  buffTargets: TargetModifierMap,
) {
  return (row.skills as { name: string; ability: string; proficient: boolean }[]).map((s) => {
    const buffs = buffTargets[s.name] ?? [];
    const tempModifier = buffs.reduce((sum, b) => sum + b.modifier, 0);
    return {
      ...s,
      proficient: s.proficient || featProficiencies.skills.has(s.name) || itemSkillProfs.has(s.name),
      ...(tempModifier !== 0
        ? {
            tempModifier,
            tempModifierSources: buffs.map((b) => ({ label: b.source, value: b.modifier })),
          }
        : {}),
    };
  });
}

// Merged tool proficiency list — creation-fixed entries (stored in
// Character.toolProficiencies) + level-gated subclass choices (from
// resources.toolProficienciesKnown, already clamped by buildResourcesView)
// + item grants. Deduped by name: creation-fixed wins over subclass.
function buildToolProficienciesView(
  row: CharacterWithRelations,
  resources: object | undefined,
  itemGrants: ReturnType<typeof deriveItemGrants>,
) {
  return mergeItemToolProficiencies(
    buildMergedToolProficiencies(
      row.toolProficiencies,
      resources && "toolProficienciesKnown" in resources
        ? (resources as { toolProficienciesKnown: ToolProfEntry[] }).toolProficienciesKnown
        : [],
    ),
    itemGrants.proficiencies.filter((p) => p.profType === "tool"),
  );
}

// Class-specific available actions for the turn tracker — derived from
// class/subclass/level + current resource pools. Universal actions are
// rendered client-side from UNIVERSAL_ACTIONS in lib/turnRules.ts;
// only class-specific ones live here to avoid double-rendering.
function buildAvailableActionsView(
  primaryClass: PrimaryClass,
  level: number,
  resources: object | undefined,
): AvailableAction[] {
  const pools =
    resources && "pools" in resources
      ? (resources as { pools: { key: string; remaining: number }[] }).pools
      : [];
  return deriveActions(
    primaryClass?.name ?? "",
    primaryClass?.subclass ?? undefined,
    level,
    pools,
  );
}

// Journal entries — relational JournalEntry rows (no longer a Json column),
// already ordered newest-first by the user-entered `date` via the include.
// `date` is a real DateTime, emitted as an ISO string; sessionId is optional
// provenance.
function buildJournalView(row: CharacterWithRelations) {
  return row.journalEntries.map((e) => ({
    id: e.id,
    kind: e.kind,
    date: e.date.toISOString(),
    loggedAt: e.loggedAt.toISOString(),
    body: e.body,
    visibility: e.visibility,
    sessionId: e.sessionId ?? undefined,
  }));
}

// Structured, multiclass-aware view alongside the flattened class/subclass.
// Clamp-on-read (issue #124): cap the cumulative per-class levels at the
// XP-derived total so a not-yet-reconciled over-cap character still renders
// correctly. Position order = allocation order, so position-0 keeps its levels
// first and trailing (newest) classes absorb the shortfall.
function buildClassesView(row: CharacterWithRelations, totalLevel: number) {
  let remaining = totalLevel;
  const out: {
    id: string;
    name: string;
    level: number;
    subclass?: string;
    subclassId?: string;
    classId?: string;
  }[] = [];
  const singleClass = row.classEntries.length <= 1;
  for (const entry of row.classEntries) {
    if (remaining <= 0) break;
    const level = Math.min(entry.level, remaining);
    remaining -= level;
    // Per-entry subclass clamp-on-read (issue #125): hide a subclass whose
    // grant level exceeds this entry's effective level (per-class for a
    // multiclass character, XP-derived total for a single class). Mirrors
    // reconcileSubclass on the write side.
    const subclassLevel = entry.class?.subclassLevel ?? 3;
    const effectiveLevel = singleClass ? totalLevel : level;
    const subclassVisible = effectiveLevel >= subclassLevel;
    out.push({
      id: entry.id,
      name: entry.name,
      level,
      subclass: subclassVisible ? (entry.subclass ?? undefined) : undefined,
      subclassId: subclassVisible ? (entry.subclassId ?? undefined) : undefined,
      classId: entry.classId ?? undefined,
    });
  }
  return out;
}

// Campaign-scoped play prefs (#537) for the current campaign; undefined when
// the character isn't attached to a campaign (campaignId null).
function buildCampaignPreferencesView(row: CharacterWithRelations) {
  if (row.campaignId == null) return undefined;
  const pref = row.campaignPreferences.find((p) => p.campaignId === row.campaignId);
  return {
    shareWithDm: pref?.shareWithDm ?? false,
    autoFriendlyHealing: pref?.autoFriendlyHealing ?? false,
  };
}

export function serializeCharacter(row: CharacterWithRelations) {
  // ── Derivation order (later steps read earlier outputs; do not reorder) ──
  // 1. XP → level + proficiency bonus (derive-don't-persist; docs/leveling.md).
  const progress = experienceProgress(row.experiencePoints);
  const primaryClass = row.classEntries[0];
  const normalizedHitPoints = normalizeHitPoints(row.hitPoints);
  const hitDice = normalizeHitDice(row.hitDice);
  const abilityScoresMap = row.abilityScores as Record<string, number>;

  // 2. Spellcasting + resources views — each clamps stored mutable state to
  //    its level-derived caps (clamp-on-read mirrors of LEVEL_GATED_RECONCILERS).
  const spellcasting = buildSpellcastingView(
    row,
    primaryClass,
    progress.level,
    abilityScoresMap,
    progress.proficiencyBonus,
  );
  const { resources, fightingStyle } = buildResourcesView(
    row,
    primaryClass,
    progress.level,
    abilityScoresMap,
    progress.proficiencyBonus,
  );

  // 3. Advancement clamp → effective scores/HP/initiative, then the feat layer
  //    summed over the surviving in-cap advancements.
  const { effectiveScores, hitPoints, effectiveInitBonus, clampedAdvancements, advSlotTotal } =
    applyAdvancementClamp(row, primaryClass, progress.level, normalizedHitPoints);
  const { featBonuses, effectiveMaxHp, featProficiencies } = applyFeatLayer(
    clampedAdvancements,
    hitDice.total,
    hitPoints.max,
  );

  // 4. Proficiency grants, the per-target modifier channel (active cast buffs
  //    #438 + item passive bonuses #545), and item-granted traits (#529).
  // Pre-compute weapon proficiency grants so they can be reused both in the
  // inventory serialisation (attack-bonus derivation) and the wire response.
  const weaponGrants = buildMergedWeaponProficiencies(
    row.classEntries,
    row.raceSelection?.name,
    featProficiencies.weapons,
  );
  const activeEffects = normalizeActiveEffectsMutable(row.activeEffects);
  const buffTargets = buildTargetModifiers(row, activeEffects);
  const { itemGrants, itemSkillProfs, itemSaveProfs } = buildItemGrantsView(row);
  const inventoryContext = buildInventoryContext(
    row,
    effectiveScores,
    progress.proficiencyBonus,
    weaponGrants,
    fightingStyle,
    buffTargets,
  );

  // 5. Equipped-armor selection feeds AC, speed (Unarmored/Fast Movement), and
  //    the Monk unarmed strike — all derived, never persisted.
  const { bestArmor, hasShield } = selectEquippedBodyArmor(row, effectiveScores);
  const { armorClass, armorClassBreakdown } = buildArmorClassView(
    row,
    effectiveScores,
    bestArmor,
    hasShield,
    fightingStyle,
    featBonuses,
    buffTargets,
  );
  const speed = buildSpeedView(row, bestArmor, hasShield, featBonuses, buffTargets);
  const { unarmedStrike, improvisedWeapon } = buildUnarmedAttacksView(
    row,
    effectiveScores,
    progress.proficiencyBonus,
    clampedAdvancements,
    weaponGrants,
    bestArmor,
    hasShield,
  );

  // 6. Final assembly — one field per line, each fed by a builder above.
  return {
    id: row.id,
    name: row.name,
    // Owning user id — legitimately persisted (see Character.ownerId comment in
    // schema.prisma), so it round-trips here rather than being derived.
    ownerId: row.ownerId,
    race: row.raceSelection?.name ?? "",
    class: primaryClass?.name ?? "",
    subclass: primaryClass?.subclass ?? undefined,
    subclassId: primaryClass?.subclassId ?? undefined,
    level: progress.level,
    background: row.backgroundSelection?.name ?? "",
    alignment: row.alignment,
    portraitUrl: row.portraitUrl ?? undefined,
    // Shared-campaign link (#246), or undefined when unassigned.
    campaignId: row.campaignId ?? undefined,
    // Campaign-scoped play prefs (#537), or undefined when unattached.
    campaignPreferences: buildCampaignPreferencesView(row),

    armorClass,
    armorClassBreakdown,
    initiativeBonus: effectiveInitBonus + featBonuses.initiative,
    speed,
    proficiencyBonus: progress.proficiencyBonus,

    experiencePoints: row.experiencePoints,
    currentLevelThreshold: progress.currentLevelThreshold,
    nextLevelThreshold: progress.nextLevelThreshold,
    // Pending level-ups: XP-derived level exceeds the number of HP levels
    // applied so far (hitDice.total tracks how many levels have been "leveled
    // up" via the /hp endpoint). The UI shows a "Level up" button when > 0.
    pendingLevelUps: Math.max(0, progress.level - hitDice.total),

    hitPoints: {
      ...hitPoints,
      max: effectiveMaxHp,
      // Don't let current exceed effective max (e.g. if Tough was removed
      // and the character hasn't spent HP yet).
      current: Math.min(hitPoints.current, effectiveMaxHp),
    },
    hitDice,
    abilityScores: effectiveScores,
    savingThrowProficiencies: buildSavingThrowProficiencies(
      row.savingThrowProficiencies,
      featProficiencies.savingThrows,
      itemSaveProfs,
    ),
    skills: buildSkillsView(row, featProficiencies, itemSkillProfs, buffTargets),
    toolProficiencies: buildToolProficienciesView(row, resources, itemGrants),
    // Armor/weapon proficiencies — derived fully at read time from class, race,
    // and feat grants. No persistence needed: these are fixed by class/race and
    // any feat-granted additions are already tracked in advancements. Deduped
    // with precedence class > race > feat so a feat re-granting an existing
    // class proficiency renders as a single class-sourced entry.
    armorProficiencies: buildMergedArmorProficiencies(
      row.classEntries,
      row.raceSelection?.name,
      featProficiencies.armor,
    ),
    weaponProficiencies: mergeItemWeaponProficiencies(
      weaponGrants,
      itemGrants.proficiencies.filter((p) => p.profType === "weapon"),
    ),
    inventory: row.inventoryItems.map((item) => serializeInventoryItem(item, inventoryContext)),
    currency: row.currency,
    spellcasting,
    resources,
    // Active status conditions + exhaustion level. Normalized on read (unknown
    // keys dropped, deduped by key, exhaustion clamped 0–6) — mutate via
    // POST /characters/:id/conditions/transactions, never PATCH.
    conditions: normalizeConditionsMutable(row.conditions),
    // Active cast-granted passive modifiers (buffs). Normalized on read; each is
    // also summed into its target skill/stat's tempModifier above.
    activeEffects,

    // Item-granted traits (#529), derived from active items — no persisted
    // columns. resistances also feed the #456 auto-halve at damage-apply time;
    // the rest render as item-sourced flags/reminders on the sheet.
    resistances: itemGrants.resistances.map((r) => ({ damageType: r.value, source: r.source })),
    damageImmunities: itemGrants.immunities.map((i) => ({ damageType: i.value, source: i.source })),
    conditionImmunities: itemGrants.conditionImmunities.map((c) => ({ condition: c.value, source: c.source })),
    grantedAdvantages: itemGrants.advantages,
    grantedProficiencies: itemGrants.proficiencies,

    // Advancements (ASI + feats) — top-level so every class sees them,
    // independent of whether deriveResources returns a non-null value.
    advancements: clampedAdvancements,
    advancementSlots: {
      total: advSlotTotal,
      used: clampedAdvancements.length,
    },

    // Class-specific available actions for the turn tracker (universal ones
    // render client-side from lib/turnRules.ts).
    availableActions: buildAvailableActionsView(primaryClass, progress.level, resources),

    // ── Combat attack rows ─────────────────────────────────────────────────
    // Derived at read time; the frontend renders these directly in AttacksPanel
    // rather than recomputing attack math on the client.
    unarmedStrike,
    improvisedWeapon,
    // Weapon attacks per Attack action (Extra Attack), max across multiclass.
    attacksPerAction: deriveAttacksPerAction(row.classEntries),

    journal: buildJournalView(row),

    // Multiclass-aware per-class view with the level + subclass clamps-on-read
    // (issues #124/#125) — see buildClassesView.
    classes: buildClassesView(row, progress.level),
  };
}
