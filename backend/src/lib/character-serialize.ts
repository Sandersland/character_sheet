import { Prisma } from "../generated/prisma/client.js";
import { experienceProgress, levelForExperience } from "./experience.js";
import {
  serializeArmorDetail,
  serializeConsumableDetail,
  serializeWeaponDetail,
} from "./itemDetail.js";
import { normalizeHitDice, normalizeHitPoints } from "./hitpoints.js";
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
} from "./srd.js";
import { deriveResources } from "./class-features.js";
import { deriveActions, type AvailableAction } from "./actions.js";
import { normalizeResourcesMutable, type AdvancementEntry, type ToolProfEntry } from "./resources.js";
import { normalizeConditionsMutable } from "./conditions.js";
import { buffsByTarget, normalizeActiveEffectsMutable, type ActiveBuff } from "./active-effects.js";
import { deriveItemPassiveBonuses, type ItemPassiveContribution } from "./capabilities.js";
import { reverseAdvancementEffects } from "./advancement.js";
import { normalizeSpellcastingMutable } from "./spellcasting.js";
import type { SpellEntry } from "./spell-state.js";
import {
  deriveGrantedSpells,
  deriveGrantedCastingAbility,
  type AbilityScores,
} from "./granted-spells.js";
import { SHADOW_ART_CONCENTRATION_PREFIX } from "./shadow-arts.js";
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
    equipped: row.equipped,
    attuned: row.attuned,
    requiresAttunement: row.requiresAttunement,
    notes: row.notes ?? undefined,
    weapon,
    armor: row.armorDetail ? serializeArmorDetail(row.armorDetail) : undefined,
    consumable: row.consumableDetail ? serializeConsumableDetail(row.consumableDetail) : undefined,
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

  if (derivedSpell) {
    const stored = normalizeSpellcastingMutable(row.spellcasting);
    const spells = mergeGrantedSpells(stored.spells, granted);
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
  if (granted.length > 0) {
    const stored = normalizeSpellcastingMutable(row.spellcasting);
    const castingAbility = deriveGrantedCastingAbility(primaryClass?.subclass ?? undefined);
    const abilMod = abilityModifier(abilityScores[castingAbility] ?? 10);
    const grantedSpells = mergeGrantedSpells(stored.spells, granted);
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
  const stored = normalizeSpellcastingMutable(row.spellcasting);

  // No caster class in the mix, but a subclass still grants a spell — surface a
  // slotless granted view (ability derived per rule; mirrors the single-class branch).
  if (multi.classes.length === 0) {
    if (granted.length === 0) return undefined;
    const castingAbility = collectGrantedCastingAbility(row.classEntries);
    const abilMod = abilityModifier(abilityScores[castingAbility] ?? 10);
    const grantedSpells = mergeGrantedSpells(stored.spells, granted);
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
  const mergedSpells = mergeGrantedSpells(stored.spells, granted);
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
  const equippedItems = row.inventoryItems.filter((i) => i.equipped);
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

  return { effectiveScores, proficiencyBonus, weaponGrants, offHandBusy, fightingStyle, meleeDamageBonus, attackRollBonus };
}

// The per-target modifier channel both skills and weapon math read: active cast
// buffs (buffsByTarget) merged with active-item scalar passiveBonus contributions
// (#545). Keyed the same way (skill name / meleeDamage / attackRoll) so item
// bonuses and buffs sum together.
type TargetModifierMap = Record<string, Array<{ modifier: number; source: string }>>;

function mergeTargetModifiers(
  buffTargets: Record<string, ActiveBuff[]>,
  contributions: ItemPassiveContribution[],
): TargetModifierMap {
  const out: TargetModifierMap = {};
  for (const [key, buffs] of Object.entries(buffTargets)) {
    out[key] = buffs.map((b) => ({ modifier: b.modifier, source: b.source }));
  }
  for (const c of contributions) {
    (out[c.target] ??= []).push({ modifier: c.modifier, source: c.source });
  }
  return out;
}

export function serializeCharacter(row: CharacterWithRelations) {
  const progress = experienceProgress(row.experiencePoints);
  const primaryClass = row.classEntries[0];
  const normalizedHitPoints = normalizeHitPoints(row.hitPoints);
  const hitDice = normalizeHitDice(row.hitDice);
  const abilityScoresMap = row.abilityScores as Record<string, number>;

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

  const { effectiveScores, hitPoints, effectiveInitBonus, clampedAdvancements, advSlotTotal } =
    applyAdvancementClamp(row, primaryClass, progress.level, normalizedHitPoints);

  const { featBonuses, effectiveMaxHp, featProficiencies } = applyFeatLayer(
    clampedAdvancements,
    hitDice.total,
    hitPoints.max,
  );

  // Pre-compute weapon proficiency grants so they can be reused both in the
  // inventory serialisation (attack-bonus derivation) and the wire response.
  const weaponGrants = buildMergedWeaponProficiencies(
    row.classEntries,
    row.raceSelection?.name,
    featProficiencies.weapons,
  );

  // Active cast-granted buffs (#438) merged with active-item scalar passiveBonus
  // contributions (#545), summed per target into the affected skill/stat's
  // tempModifier below (and into melee/attack weapon math). Both follow the
  // base + additive-terms pattern; item bonuses apply only while equipped/attuned.
  const activeEffects = normalizeActiveEffectsMutable(row.activeEffects);
  const itemPassiveBonuses = deriveItemPassiveBonuses(
    row.inventoryItems.map((i) => ({
      name: i.name,
      equipped: i.equipped,
      attuned: i.attuned,
      capabilities: i.capabilities,
    })),
  );
  const buffTargets = mergeTargetModifiers(buffsByTarget(activeEffects), itemPassiveBonuses);

  const inventoryContext = buildInventoryContext(
    row,
    effectiveScores,
    progress.proficiencyBonus,
    weaponGrants,
    fightingStyle,
    buffTargets,
  );

  // AC is derived, not persisted: best equipped body armor + Dex (per category)
  // + shield. No slot model exists, so the highest-AC body armor wins.
  const equippedArmorDetails = row.inventoryItems
    .filter((i) => i.equipped && i.armorDetail)
    .map((i) => ({ name: i.name, ...i.armorDetail! }));
  const hasShield = equippedArmorDetails.some((a) => a.armorCategory === "shield");
  const dexMod = abilityModifier(effectiveScores.dexterity ?? 10);
  // Feeds Unarmored Defense (Barbarian/Monk) when no body armor is equipped.
  const unarmoredDefense = {
    classNames: row.classEntries.map((e) => e.name),
    conMod: abilityModifier(effectiveScores.constitution ?? 10),
    wisMod: abilityModifier(effectiveScores.wisdom ?? 10),
  };
  const bestArmor = equippedArmorDetails
    .filter((a): a is (typeof equippedArmorDetails)[number] & { armorCategory: BodyArmorCategory } => a.armorCategory !== "shield")
    .reduce<Parameters<typeof deriveArmorClassParts>[0]>((best, a) => {
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

  // Monk Unarmored Movement: level-scaled speed bonus while unarmored & unshielded.
  // Additive term, off monk class level — never merged into feat/racial speed.
  const monkLevel = row.classEntries.find((e) => e.name.toLowerCase() === "monk")?.level ?? 0;
  const unarmoredMovementBonus = deriveUnarmoredMovement({
    monkLevel,
    isUnarmored: bestArmor === null,
    hasShield,
  });

  // ── Unarmed strike + improvised weapon derivation ────────────────────────
  // Derived from the same clamped advancements slice so Tavern Brawler's
  // upgrades are automatically excluded when the character is over-cap. A Monk
  // (unarmored & unshielded) swaps in max(Dex, Str) + the level-scaled Martial
  // Arts die, off the monk class-entry level for multiclass correctness.
  const unarmedDie = deriveUnarmedDamageDie(clampedAdvancements);
  const unarmedStrike = deriveUnarmedStrike(effectiveScores, progress.proficiencyBonus, unarmedDie, {
    level: monkLevel,
    isUnarmored: bestArmor === null,
    hasShield,
  });
  const improvisedProficient = weaponGrants.some((g) => g.name === "Improvised Weapons");
  const improvisedWeapon = deriveImprovisedAttack(
    effectiveScores,
    progress.proficiencyBonus,
    improvisedProficient,
  );

  // Barbarian Fast Movement: +10 ft at barbarian class level 5+ unless wearing
  // heavy armor. Additive term off barbarian class level — never merged into feats.
  const barbarianLevel = row.classEntries.find((e) => e.name.toLowerCase() === "barbarian")?.level ?? 0;
  const fastMovementBonus = deriveFastMovement({
    barbarianLevel,
    wearingHeavyArmor: bestArmor?.armorCategory === "heavy",
  });

  // Labeled AC addends; armorClass below is their exact sum (single source in srd.ts).
  const acParts = deriveArmorClassParts(bestArmor, hasShield, dexMod, unarmoredDefense);
  // Defense fighting style only applies while wearing body armor (5e).
  const styleAc = bestArmor !== null ? deriveFightingStyleBonuses(fightingStyle).armorClass : 0;
  if (styleAc !== 0) acParts.push({ label: "Defense fighting style", value: styleAc });
  if (featBonuses.armorClass !== 0) acParts.push({ label: "Feats", value: featBonuses.armorClass });

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
    // Campaign-scoped play prefs (#537) for the current campaign; undefined when
    // the character isn't attached to a campaign (campaignId null).
    campaignPreferences: (() => {
      if (row.campaignId == null) return undefined;
      const pref = row.campaignPreferences.find((p) => p.campaignId === row.campaignId);
      return {
        shareWithDm: pref?.shareWithDm ?? false,
        autoFriendlyHealing: pref?.autoFriendlyHealing ?? false,
      };
    })(),

    armorClass: acParts.reduce((total, p) => total + p.value, 0),
    armorClassBreakdown: acParts,
    initiativeBonus: effectiveInitBonus + featBonuses.initiative,
    // Additive terms + any active "speed"-targeted buff (e.g. Boots of Speed, #543).
    speed:
      row.speed +
      featBonuses.speed +
      unarmoredMovementBonus +
      fastMovementBonus +
      (buffTargets["speed"] ?? []).reduce((sum, b) => sum + b.modifier, 0),
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
    // Merge feat-granted saving throw proficiencies (OR with class-fixed stored set;
    // deduped via Set round-trip).
    savingThrowProficiencies: featProficiencies.savingThrows.size > 0
      ? [...new Set([...row.savingThrowProficiencies, ...featProficiencies.savingThrows])]
      : row.savingThrowProficiencies,
    // Merge feat-granted skill proficiencies (proficient stays true if already
    // true; feats only add) and overlay any active buff as an optional
    // tempModifier + labeled breakdown (#438). Additive term, derived on read.
    skills: (row.skills as { name: string; ability: string; proficient: boolean }[]).map((s) => {
      const buffs = buffTargets[s.name] ?? [];
      const tempModifier = buffs.reduce((sum, b) => sum + b.modifier, 0);
      return {
        ...s,
        proficient: s.proficient || featProficiencies.skills.has(s.name),
        ...(tempModifier !== 0
          ? {
              tempModifier,
              tempModifierSources: buffs.map((b) => ({ label: b.source, value: b.modifier })),
            }
          : {}),
      };
    }),
    // Merged tool proficiency list — creation-fixed entries (stored in
    // Character.toolProficiencies) + level-gated subclass choices (from
    // resources.toolProficienciesKnown, already clamped above).
    // Deduped by name: creation-fixed wins over subclass if both appear.
    toolProficiencies: buildMergedToolProficiencies(
      row.toolProficiencies,
      resources && "toolProficienciesKnown" in resources
        ? (resources as { toolProficienciesKnown: ToolProfEntry[] }).toolProficienciesKnown
        : [],
    ),
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
    weaponProficiencies: weaponGrants,
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

    // Advancements (ASI + feats) — top-level so every class sees them,
    // independent of whether deriveResources returns a non-null value.
    advancements: clampedAdvancements,
    advancementSlots: {
      total: advSlotTotal,
      used: clampedAdvancements.length,
    },

    // Class-specific available actions for the turn tracker — derived from
    // class/subclass/level + current resource pools. Universal actions are
    // rendered client-side from UNIVERSAL_ACTIONS in lib/turnRules.ts;
    // only class-specific ones live here to avoid double-rendering.
    availableActions: ((): AvailableAction[] => {
      const pools =
        resources && "pools" in resources
          ? (resources as { pools: { key: string; remaining: number }[] }).pools
          : [];
      return deriveActions(
        primaryClass?.name ?? "",
        primaryClass?.subclass ?? undefined,
        progress.level,
        pools,
      );
    })(),

    // ── Combat attack rows ─────────────────────────────────────────────────
    // Derived at read time; the frontend renders these directly in AttacksPanel
    // rather than recomputing attack math on the client.
    unarmedStrike,
    improvisedWeapon,
    // Weapon attacks per Attack action (Extra Attack), max across multiclass.
    attacksPerAction: deriveAttacksPerAction(row.classEntries),

    // Journal entries — relational JournalEntry rows (no longer a Json column),
    // already ordered newest-first by the user-entered `date` via the include.
    // `date` is a real DateTime, emitted as an ISO string; sessionId is optional
    // provenance.
    journal: row.journalEntries.map((e) => ({
      id: e.id,
      kind: e.kind,
      date: e.date.toISOString(),
      loggedAt: e.loggedAt.toISOString(),
      body: e.body,
      visibility: e.visibility,
      sessionId: e.sessionId ?? undefined,
    })),

    // Structured, multiclass-aware view alongside the flattened class/subclass
    // above. Clamp-on-read (issue #124): cap the cumulative per-class levels at
    // the XP-derived total so a not-yet-reconciled over-cap character still
    // renders correctly. Position order = allocation order, so position-0 keeps
    // its levels first and trailing (newest) classes absorb the shortfall.
    classes: (() => {
      let remaining = progress.level;
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
        const effectiveLevel = singleClass ? progress.level : level;
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
    })(),
  };
}
