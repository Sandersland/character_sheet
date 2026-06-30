import { randomUUID } from "node:crypto";

import { Router } from "express";
import { z } from "zod";

import { Prisma } from "../generated/prisma/client.js";
import { experienceProgress, levelForExperience } from "../lib/experience.js";
import { logEvent } from "../lib/events.js";
import {
  serializeArmorDetail,
  serializeConsumableDetail,
  serializeWeaponDetail,
} from "../lib/itemDetail.js";
import { buildInventoryCreateFromCatalog, catalogItemDetailInclude, selectAutoEquip } from "../lib/inventory.js";
import { prisma } from "../lib/prisma.js";
import { normalizeHitDice, normalizeHitPoints } from "../lib/hitpoints.js";
import {
  ALIGNMENTS,
  advancementSlotsForLevel,
  CLASS_PROFICIENCY_GRANTS,
  deriveCreatedCharacter,
  deriveFeatBonuses,
  deriveFeatProficiencies,
  deriveSpellcasting,
  deriveImprovisedAttack,
  deriveUnarmedDamageDie,
  deriveUnarmedStrike,
  deriveWeaponAttackBonus,
  deriveWeaponDamage,
  deriveFightingStyleBonuses,
  fightingStyleChoiceCount,
  isKnownTool,
  RACE_PROFICIENCY_GRANTS,
  TOOLS,
  type ArmorProficiencyCategory,
  type FightingStyleKey,
  type ToolProficiencyEntry,
} from "../lib/srd.js";
import { deriveResources } from "../lib/class-features.js";
import { deriveActions, type AvailableAction } from "../lib/actions.js";
import { STARTING_EQUIPMENT } from "../lib/starting-equipment.js";
import { normalizeResourcesMutable, type ToolProfEntry } from "../lib/resources.js";
import { normalizeConditionsMutable } from "../lib/conditions.js";
import { reverseAdvancementEffects } from "../lib/advancement.js";
import { normalizeSpellcastingMutable } from "../lib/spellcasting.js";
import { assertCharacterAccess } from "../lib/auth/access.js";

export const charactersRouter = Router();

// Shared `include` for fetching a full character with its race/background/
// class selections. classEntries is ordered so index 0 is always the
// primary class (v1 creates exactly one; multiclass support will append
// more at increasing `position` values later). Exported for routes/
// inventory.ts to reuse — every inventory-transaction op returns the full
// serialized character, same shape as this file's own endpoints.
export const characterInclude = {
  raceSelection: true,
  backgroundSelection: true,
  classEntries: { orderBy: { position: "asc" } },
  inventoryItems: {
    orderBy: { position: "asc" },
    include: { weaponDetail: true, armorDetail: true, consumableDetail: true },
  },
  // Newest-first by the user-entered calendar `date`; `createdAt desc` is a
  // stable tiebreaker so same-date entries stay newest-written-first.
  journalEntries: { orderBy: [{ date: "desc" }, { createdAt: "desc" }] },
} satisfies Prisma.CharacterInclude;

type CharacterWithRelations = Prisma.CharacterGetPayload<{ include: typeof characterInclude }>;

function serializeCharacterSummary(row: {
  id: string;
  name: string;
  ownerId: string;
  portraitUrl: string | null;
  experiencePoints: number;
  raceSelection: { name: string } | null;
  classEntries: { name: string }[];
}) {
  return {
    id: row.id,
    name: row.name,
    // Owning user id (legitimately persisted — see Character.ownerId in
    // schema.prisma). Access is enforced per-owner via assertCharacterAccess;
    // emitted here so the frontend can identify/display the owner.
    ownerId: row.ownerId,
    // raceSelection/classEntries are optional in Prisma's types only
    // because they're the non-FK side of the relation — every character
    // created via POST /characters has exactly one of each.
    race: row.raceSelection?.name ?? "",
    class: row.classEntries[0]?.name ?? "",
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

export function serializeCharacter(row: CharacterWithRelations) {
  const progress = experienceProgress(row.experiencePoints);
  const primaryClass = row.classEntries[0];
  let hitPoints = normalizeHitPoints(row.hitPoints);
  const hitDice = normalizeHitDice(row.hitDice);

  // Derive spellcasting stats at read time (ability, DC, attack, slot totals)
  // rather than persisting them — same pattern as level/proficiencyBonus.
  // The stored JSON only holds mutable state: slotsUsed + spells[].
  const abilityScoresMap = row.abilityScores as Record<string, number>;
  const derivedSpell = deriveSpellcasting(
    primaryClass?.name ?? "",
    progress.level,
    abilityScoresMap,
    progress.proficiencyBonus,
    primaryClass?.subclass ?? undefined,
  );

  let spellcasting: object | undefined;
  if (derivedSpell) {
    const stored = normalizeSpellcastingMutable(row.spellcasting);
    spellcasting = {
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
      spells: stored.spells,
      // Active concentration spell, or null. Clamp-on-read: if the concentrated
      // entry is no longer in the spellbook, treat it as not concentrating.
      concentratingOn:
        stored.concentratingOn &&
        stored.spells.some((s) => s.id === stored.concentratingOn!.entryId)
          ? stored.concentratingOn
          : null,
    };
  } else if (
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
    spellcasting = row.spellcasting as object;
  }

  // Derive class/subclass resources at read time — same derive-don't-persist
  // pattern as spellcasting. Only `used` counts and maneuversKnown persist.
  const derivedRes = deriveResources(
    primaryClass?.name ?? "",
    primaryClass?.subclass ?? undefined,
    progress.level,
    abilityScoresMap,
    progress.proficiencyBonus,
  );

  // ── Fighting Style clamp-on-read ──────────────────────────────────────────
  // The chosen style key is persisted in resources.fightingStyle. Clamp it to
  // null when the character is no longer entitled (e.g. class change / level
  // drop) — defense-in-depth mirroring reconcileFightingStyle on the write side.
  const fightingStyleChoices = fightingStyleChoiceCount(
    primaryClass?.name ?? "",
    progress.level,
  );
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
    resources = {
      features: derivedRes.features,
      maneuverChoiceCount: derivedRes.maneuverChoiceCount,
      maneuverSaveDC: derivedRes.maneuverSaveDC,
      toolProfChoiceCount: derivedRes.toolProfChoiceCount,
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
      toolProficienciesKnown: clampedToolProfsKnown,
      // Fighting Style choice surface for the frontend picker. Choice count is
      // level-gated (Fighter L1 -> 1); fightingStyle is already clamped to null
      // when the character isn't entitled.
      fightingStyleChoiceCount: fightingStyleChoices,
      fightingStyle,
    };
  }

  // ── Advancement clamp-on-read ─────────────────────────────────────────────
  // Mirrors the reconcile-on-write in level-reconciliation.ts: if the stored
  // advancements array exceeds the level-derived slot count (e.g. the character
  // hasn't had a reconciling XP op since leveling down), cap the displayed
  // values and derive effective ability scores / HP / initiative from the
  // clamped list. This ensures the sheet always reflects a valid state.
  const storedForAdv = normalizeResourcesMutable(row.resources);
  const advSlotTotal = advancementSlotsForLevel(primaryClass?.name ?? "", progress.level);
  let effectiveScores = row.abilityScores as Record<string, number>;
  let effectiveInitBonus = row.initiativeBonus;
  const clampedAdvancements = storedForAdv.advancements.slice(0, advSlotTotal);

  if (clampedAdvancements.length < storedForAdv.advancements.length) {
    // Some advancements are beyond the cap — reverse the excess ones to compute
    // effective display values (without writing; reconcile-on-write handles that).
    const excess = storedForAdv.advancements.slice(advSlotTotal);
    const reversed = reverseAdvancementEffects(
      effectiveScores,
      hitPoints,
      effectiveInitBonus,
      excess,
    );
    effectiveScores = reversed.scores;
    hitPoints = reversed.hitPoints;
    effectiveInitBonus = reversed.initiativeBonus;
  }

  // ── Feat improvement modifier layer ───────────────────────────────────────
  // Sum structured feat improvements over the in-cap advancements. Because
  // clampedAdvancements already excludes over-cap feats, level-down behavior
  // is automatic — no separate reversal code needed.
  // perLevel bonuses (e.g. Tough) scale with hitDice.total (applied level).
  const featBonuses = deriveFeatBonuses(clampedAdvancements, hitDice.total);
  const effectiveMaxHp = hitPoints.max + featBonuses.maxHp;

  // Proficiency grants from feats (skills + saving throws). Merged with stored
  // proficiencies below using OR — existing proficiency is never removed.
  const featProficiencies = deriveFeatProficiencies(clampedAdvancements);

  // Pre-compute weapon proficiency grants so they can be reused both in the
  // inventory serialisation (attack-bonus derivation) and the wire response.
  const weaponGrants = buildMergedWeaponProficiencies(
    row.classEntries,
    row.raceSelection?.name,
    featProficiencies.weapons,
  );

  // ── Unarmed strike + improvised weapon derivation ────────────────────────
  // Derived from the same clamped advancements slice so Tavern Brawler's
  // upgrades are automatically excluded when the character is over-cap.
  const unarmedDie = deriveUnarmedDamageDie(clampedAdvancements);
  const unarmedStrike = deriveUnarmedStrike(effectiveScores, progress.proficiencyBonus, unarmedDie);
  const improvisedProficient = weaponGrants.some((g) => g.name === "Improvised Weapons");
  const improvisedWeapon = deriveImprovisedAttack(
    effectiveScores,
    progress.proficiencyBonus,
    improvisedProficient,
  );

  // Compute off-hand state once for the whole inventory so versatile weapons
  // know whether to use their two-handed die. Off-hand is "busy" when any
  // equipped item is a shield OR when 2+ weapons are equipped (two-weapon
  // fighting). This is the lightweight approach that avoids a full
  // main-hand/off-hand slot model.
  const equippedItems = row.inventoryItems.filter((i) => i.equipped);
  const equippedShieldPresent = equippedItems.some(
    (i) => i.armorDetail?.armorCategory === "shield",
  );
  const equippedWeaponCount = equippedItems.filter((i) => i.category === "weapon").length;
  const offHandBusy = equippedShieldPresent || equippedWeaponCount >= 2;

  const inventoryContext: InventoryItemContext = {
    effectiveScores,
    proficiencyBonus: progress.proficiencyBonus,
    weaponGrants,
    offHandBusy,
    fightingStyle,
  };

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

    armorClass:
      row.armorClass + featBonuses.armorClass + deriveFightingStyleBonuses(fightingStyle).armorClass,
    initiativeBonus: effectiveInitBonus + featBonuses.initiative,
    speed: row.speed + featBonuses.speed,
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
    // Merge feat-granted skill proficiencies: proficient stays true if already true;
    // feat grants can only add proficiency, never remove it.
    skills: featProficiencies.skills.size > 0
      ? (row.skills as { name: string; ability: string; proficient: boolean }[]).map((s) => ({
          ...s,
          proficient: s.proficient || featProficiencies.skills.has(s.name),
        }))
      : row.skills,
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

    // Journal entries — relational JournalEntry rows (no longer a Json column),
    // already ordered newest-first by the user-entered `date` via the include.
    // `date` is a real DateTime, emitted as an ISO string; sessionId is optional
    // provenance.
    journal: row.journalEntries.map((e) => ({
      id: e.id,
      title: e.title,
      date: e.date.toISOString(),
      body: e.body,
      sessionId: e.sessionId ?? undefined,
    })),

    // Structured, multiclass-aware view alongside the flattened
    // class/subclass above — today always a single entry.
    classes: row.classEntries.map((entry) => ({
      name: entry.name,
      level: entry.level,
      subclass: entry.subclass ?? undefined,
      subclassId: entry.subclassId ?? undefined,
      classId: entry.classId ?? undefined,
    })),
  };
}

// Owner-scoped listing: a caller only ever sees their own characters. The
// authenticated user is attached by requireAuth (app.ts).
charactersRouter.get("/characters", async (req, res) => {
  const characters = await prisma.character.findMany({
    where: { ownerId: req.user!.id },
    select: {
      id: true,
      name: true,
      ownerId: true,
      portraitUrl: true,
      experiencePoints: true,
      raceSelection: { select: { name: true } },
      classEntries: { select: { name: true }, orderBy: { position: "asc" }, take: 1 },
    },
    orderBy: { name: "asc" },
  });

  res.json(characters.map(serializeCharacterSummary));
});

charactersRouter.get("/characters/:id", async (req, res) => {
  await assertCharacterAccess(prisma, req.user!.id, req.params.id, "view");

  const character = await prisma.character.findUniqueOrThrow({
    where: { id: req.params.id },
    include: characterInclude,
  });

  res.json(serializeCharacter(character));
});

const abilityScoresSchema = z.object({
  strength: z.number().int(),
  dexterity: z.number().int(),
  constitution: z.number().int(),
  intelligence: z.number().int(),
  wisdom: z.number().int(),
  charisma: z.number().int(),
});

// A single class choice today, but the array shape means accepting a second
// entry later (multiclassing) doesn't require another request-schema
// migration, just relaxing the `.length(1)` constraint below.
const classChoiceSchema = z.object({
  name: z.string().min(1),
  subclass: z.string().nullable().optional(),
  // Catalog subclass FK — required when the class grants its subclass at
  // creation level (Cleric L1, Sorcerer L1, Warlock L1). Null/absent for
  // classes whose subclass is chosen post-creation (Fighter L3, etc.).
  subclassId: z.string().optional(),
});

// One entry per choice group sent by the frontend when mode:"package". Each
// entry carries the chosen optionIndex within that group's options array and,
// for any open weapon picks in the chosen bundle, the catalog item names the
// player selected (in the same order as the bundle's openPicks array).
const packageSelectionSchema = z.object({
  optionIndex: z.number().int().nonnegative(),
  openPicks: z.array(z.string()).optional(),
});

const startingEquipmentSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("package"),
    selections: z.array(packageSelectionSchema),
  }),
  z.object({
    mode: z.literal("gold"),
    gold: z.number().int().nonnegative(),
  }),
]);

const createCharacterSchema = z
  .object({
    name: z.string().min(1),
    alignment: z.string().min(1),
    portraitUrl: z.string().nullable().optional(),
    experiencePoints: z.number().int().nonnegative().optional(),
    race: z.string().min(1),
    background: z.string().min(1),
    classes: z.array(classChoiceSchema).length(1),
    abilityScores: abilityScoresSchema,
    skillProficiencies: z.array(z.string()).optional(),
    /** Tool names chosen by the player at creation (class choices only —
     *  fixed grants from background/class/race are applied server-side). */
    toolChoices: z.array(z.string()).optional(),
    startingEquipment: startingEquipmentSchema.optional(),
  })
  .strict();

// Resolves a list of FixedItemRef-style catalog names + quantities into
// InventoryItem nested-create payloads. Expands pack names via PACK_CONTENTS.
// Fetches all required catalog Items in one query (by name) and throws an
// object with a `message` string if any name is unknown, so the caller can
// return a 400.
async function resolveFixedItems(
  refs: { catalogName: string; quantity?: number }[]
): Promise<{ inventoryCreates: ReturnType<typeof buildInventoryCreateFromCatalog>[]; error?: string }> {
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

charactersRouter.post("/characters", async (req, res) => {
  const parseResult = createCharacterSchema.safeParse(req.body);

  if (!parseResult.success) {
    res
      .status(400)
      .json({ error: "Invalid request body", details: parseResult.error.flatten() });
    return;
  }

  const input = parseResult.data;

  if (!ALIGNMENTS.includes(input.alignment)) {
    res.status(400).json({ error: `Unknown alignment: ${input.alignment}` });
    return;
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

  // Validate subclass choice when provided: must belong to the chosen class
  // and only classes that grant subclasses at level 1 can have one at creation.
  let resolvedSubclassId: string | null = null;
  let resolvedSubclassName: string | null = null;
  if (primaryClassChoice.subclassId && characterClass) {
    const subclass = await prisma.subclass.findUnique({
      where: { id: primaryClassChoice.subclassId },
    });
    if (!subclass) {
      res.status(400).json({ error: `Unknown subclass id: ${primaryClassChoice.subclassId}` });
      return;
    }
    if (subclass.classId !== characterClass.id) {
      res
        .status(400)
        .json({ error: `Subclass "${subclass.name}" does not belong to ${characterClass.name}` });
      return;
    }
    if (characterClass.subclassLevel > 1) {
      res.status(400).json({
        error: `${characterClass.name} grants its subclass at level ${characterClass.subclassLevel}, not at creation (level 1)`,
      });
      return;
    }
    resolvedSubclassId = subclass.id;
    resolvedSubclassName = subclass.name;
  } else if (primaryClassChoice.subclass && !primaryClassChoice.subclassId) {
    // Legacy: plain string subclass name with no id (homebrew / pre-catalog).
    resolvedSubclassName = primaryClassChoice.subclass;
  }

  // Mechanical derivation needs a catalog anchor for race + class. The
  // background only grants skill-proficiency choices (no mechanical
  // fields), so — unlike race/class — it's allowed to be homebrew: an
  // unresolved name is kept as-is with a null backgroundId rather than
  // rejected.
  if (!race) {
    res.status(400).json({ error: `Unknown race: ${input.race}` });
    return;
  }
  if (!characterClass) {
    res.status(400).json({ error: `Unknown class: ${primaryClassChoice.name}` });
    return;
  }

  const skillProficiencies = input.skillProficiencies ?? [];
  const allowedSkills = new Set([
    ...characterClass.skillChoices,
    ...(background?.skillProficiencies ?? []),
  ]);
  const invalidSkills = skillProficiencies.filter((skill) => !allowedSkills.has(skill));
  if (invalidSkills.length > 0) {
    res
      .status(400)
      .json({ error: `Invalid skill proficiencies: ${invalidSkills.join(", ")}` });
    return;
  }

  const maxSkillChoices = characterClass.skillChoiceCount + (background?.skillProficiencies.length ?? 0);
  if (skillProficiencies.length > maxSkillChoices) {
    res
      .status(400)
      .json({ error: `Too many skill proficiencies selected (max ${maxSkillChoices})` });
    return;
  }

  // ── Tool proficiency validation ─────────────────────────────────────────
  // Fixed grants come from background/class/race — applied server-side.
  // toolChoices in the request are the player's selections from the class
  // toolChoices pool (e.g. 3 instruments for Bard).
  const playerToolChoices = input.toolChoices ?? [];
  if (playerToolChoices.length > 0) {
    const allowedToolChoices = new Set(characterClass.toolChoices);
    const invalidToolChoices = playerToolChoices.filter((t) => !allowedToolChoices.has(t));
    if (invalidToolChoices.length > 0) {
      res.status(400).json({
        error: `Invalid tool choices: ${invalidToolChoices.join(", ")}. Must be from the class's toolChoices list.`,
      });
      return;
    }
    if (!playerToolChoices.every((t) => isKnownTool(t))) {
      res.status(400).json({ error: "Unknown tool name in toolChoices" });
      return;
    }
    if (playerToolChoices.length > characterClass.toolChoiceCount) {
      res.status(400).json({
        error: `Too many tool choices (max ${characterClass.toolChoiceCount})`,
      });
      return;
    }
  }

  // Assemble creation-fixed tool proficiencies from all three fixed sources.
  // toolChoices (player picks) count as a "class" source.
  const creationToolProfs = [
    ...(background?.toolProficiencies ?? []).map((name) => ({ name, source: "background" as const })),
    ...(characterClass.toolProficiencies ?? []).map((name) => ({ name, source: "class" as const })),
    ...(race?.toolProficiencies ?? []).map((name) => ({ name, source: "race" as const })),
    ...playerToolChoices.map((name) => ({ name, source: "class" as const })),
  ];

  // ── Resolve starting equipment ──────────────────────────────────────────
  // Starting equipment is optional (omitting it creates an empty-inventory
  // character, preserving the existing behaviour and all current tests).
  // When provided, the backend re-resolves authoritatively against the
  // STARTING_EQUIPMENT rules — the frontend only sends choice indices and
  // open-pick item names; it never sends the full item list itself.
  //
  // We use a nested `inventoryItems: { create: [...] }` on character.create
  // rather than calling applyInventoryOperations: the character has no id
  // yet, and starting gear is genesis state, not an economic event — it
  // should not generate ledger rows (same reasoning prisma/seed.ts uses).
  let inventoryItemCreates: ReturnType<typeof buildInventoryCreateFromCatalog>[] = [];
  let startingCurrency: { cp: number; sp: number; gp: number; pp: number } | undefined;

  if (input.startingEquipment) {
    const se = input.startingEquipment;

    if (se.mode === "gold") {
      // Validate gold is within the class's dice range
      const classDef = STARTING_EQUIPMENT[primaryClassChoice.name];
      if (classDef) {
        const { diceCount, diceFaces, multiplier } = classDef.gold;
        const min = diceCount * multiplier;
        const max = diceCount * diceFaces * multiplier;
        if (se.gold < min || se.gold > max) {
          res.status(400).json({
            error: `Starting gold must be between ${min} and ${max} for ${primaryClassChoice.name}`,
          });
          return;
        }
      }
      startingCurrency = { cp: 0, sp: 0, gp: se.gold, pp: 0 };
    } else {
      // mode === "package"
      const classDef = STARTING_EQUIPMENT[primaryClassChoice.name];
      if (!classDef) {
        res.status(400).json({
          error: `No starting equipment package defined for class: ${primaryClassChoice.name}`,
        });
        return;
      }

      if (se.selections.length !== classDef.groups.length) {
        res.status(400).json({
          error: `Expected ${classDef.groups.length} equipment selections, got ${se.selections.length}`,
        });
        return;
      }

      // Collect all fixed items and validate all open picks
      const allFixedRefs: { catalogName: string; quantity: number }[] = [];

      for (let groupIdx = 0; groupIdx < classDef.groups.length; groupIdx++) {
        const group = classDef.groups[groupIdx];
        const sel = se.selections[groupIdx];

        if (sel.optionIndex < 0 || sel.optionIndex >= group.options.length) {
          res.status(400).json({
            error: `Equipment group ${groupIdx}: optionIndex ${sel.optionIndex} out of range (0–${group.options.length - 1})`,
          });
          return;
        }

        const bundle = group.options[sel.optionIndex];

        // Fixed items in the chosen bundle
        for (const ref of bundle.items ?? []) {
          // Pack names are expanded later in resolveFixedItems
          allFixedRefs.push({ catalogName: ref.catalogName, quantity: ref.quantity ?? 1 });
        }

        // Open picks — validate each against its filter
        const openPicks = bundle.openPicks ?? [];
        const providedPicks = sel.openPicks ?? [];
        if (providedPicks.length !== openPicks.length) {
          res.status(400).json({
            error: `Equipment group ${groupIdx}, option ${sel.optionIndex}: expected ${openPicks.length} open picks, got ${providedPicks.length}`,
          });
          return;
        }

        for (let pickIdx = 0; pickIdx < openPicks.length; pickIdx++) {
          const pickFilter = openPicks[pickIdx].filter;
          const chosenName = providedPicks[pickIdx];

          // Look up the item in the catalog and validate it matches the filter
          const catalogItem = await prisma.item.findUnique({
            where: { name: chosenName },
            include: { weaponDetail: true },
          });

          if (!catalogItem || catalogItem.category !== "weapon") {
            res.status(400).json({
              error: `Open pick "${chosenName}" is not a known weapon in the catalog`,
            });
            return;
          }
          if (
            pickFilter.weaponClass &&
            catalogItem.weaponDetail?.weaponClass !== pickFilter.weaponClass
          ) {
            res.status(400).json({
              error: `Open pick "${chosenName}" does not satisfy filter: weaponClass must be "${pickFilter.weaponClass}"`,
            });
            return;
          }
          if (
            pickFilter.range &&
            catalogItem.weaponDetail?.weaponRange !== pickFilter.range
          ) {
            res.status(400).json({
              error: `Open pick "${chosenName}" does not satisfy filter: range must be "${pickFilter.range}"`,
            });
            return;
          }

          allFixedRefs.push({ catalogName: chosenName, quantity: openPicks[pickIdx].quantity ?? 1 });
        }
      }

      // Resolve all items (expands packs) into InventoryItem create payloads
      const { inventoryCreates, error } = await resolveFixedItems(allFixedRefs);
      if (error) {
        res.status(400).json({ error });
        return;
      }
      inventoryItemCreates = inventoryCreates;
    }
  }

  // Auto-equip a new character's starting weapon/armor so the in-session
  // Attack picker isn't empty on a freshly created sheet (issue #51). The 5e
  // selection rule lives in lib/ (selectAutoEquip); the route just applies its
  // decision by flipping `equipped` on the chosen create payloads.
  for (const idx of selectAutoEquip(inventoryItemCreates)) {
    inventoryItemCreates[idx].equipped = true;
  }

  const derived = deriveCreatedCharacter(
    { abilityScores: input.abilityScores, skillProficiencies, toolProficiencies: creationToolProfs },
    { race, characterClass }
  );

  // The creating user owns the character (requireAuth guarantees req.user).
  const created = await prisma.character.create({
    data: {
      owner: { connect: { id: req.user!.id } },
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
            subclass: resolvedSubclassName,
            subclassId: resolvedSubclassId,
            classId: characterClass.id,
            position: 0,
          },
        ],
      },
      ...(inventoryItemCreates.length > 0
        ? { inventoryItems: { create: inventoryItemCreates } }
        : {}),
    },
    include: characterInclude,
  });

  res.status(201).json(serializeCharacter(created));
});

// race/class/subclass/background are deliberately absent here — they're now
// relation-backed selections, not Character columns (see schema.prisma).
// level and proficiencyBonus are also absent — they're derived, never
// persisted, so .strict() rejects a client trying to set them directly
// instead of silently ignoring it. inventory is absent too, for a different
// reason: it's now InventoryItem rows, not a Json column, so a blind
// full-array PATCH can't express intent (acquired vs. consumed vs. sold) —
// see POST /api/characters/:id/inventory/transactions instead.
//
// experiencePoints is also absent here — XP changes must go through
// POST /api/characters/:id/experience (routes/experience.ts) so they are
// logged to the activity timeline and auto-reverse HP on level-down.
//
// currency IS still patchable here (a bare DM-handed-over amount isn't
// economically categorised as a buy/sell/etc.); the handler writes a
// currencyAdjust event in the same transaction.
const updateCharacterSchema = z
  .object({
    name: z.string().min(1),
    alignment: z.string().min(1),
    portraitUrl: z.string().nullable(),
    armorClass: z.number().int(),
    initiativeBonus: z.number().int(),
    speed: z.number().int().nonnegative(),
    hitPoints: z.object({
      current: z.number().int(),
      max: z.number().int(),
      temp: z.number().int(),
      // Optional so callers that don't know about death saves can still PATCH
      // without stripping the field; normalizeHitPoints handles the default.
      deathSaves: z.object({
        successes: z.number().int().min(0).max(3),
        failures: z.number().int().min(0).max(3),
      }).optional(),
    }),
    hitDice: z.object({
      total: z.number().int(),
      die: z.string(),
      // Optional for the same backward-compat reason as deathSaves above.
      spent: z.number().int().min(0).optional(),
    }),
    abilityScores: z.record(z.string(), z.number().int()),
    savingThrowProficiencies: z.array(z.string()),
    skills: z.array(z.unknown()),
    currency: z.object({
      cp: z.number().int(),
      sp: z.number().int(),
      gp: z.number().int(),
      pp: z.number().int(),
    }),
    // spellcasting is intentionally absent: mutate via
    // POST /characters/:id/spellcasting/transactions instead, so that slot
    // expenditure and spell changes are logged as events (same reasoning as
    // inventory being absent from PATCH).
    //
    // journal is also absent: it's now the relational JournalEntry table,
    // mutated via the plain-REST routes/journal.ts CRUD endpoints, not PATCH.
  })
  .partial()
  .strict();

charactersRouter.patch("/characters/:id", async (req, res) => {
  const parseResult = updateCharacterSchema.safeParse(req.body);

  if (!parseResult.success) {
    res
      .status(400)
      .json({ error: "Invalid request body", details: parseResult.error.flatten() });
    return;
  }

  await assertCharacterAccess(prisma, req.user!.id, req.params.id, "edit");

  const existing = await prisma.character.findUniqueOrThrow({
    where: { id: req.params.id },
    select: { id: true, currency: true },
  });

  // If currency is changing, log a currencyAdjust event in the same
  // transaction so the activity timeline records bare DM-handed-over amounts.
  let updated: Awaited<ReturnType<typeof prisma.character.findUnique>> & object;
  const patchData = parseResult.data as Prisma.CharacterUpdateInput;

  if (parseResult.data.currency) {
    const oldCurrency = existing.currency as Record<string, number>;
    const newCurrency = parseResult.data.currency as Record<string, number>;
    // Build a one-line delta summary, e.g. "+5 gp −2 sp"
    const parts: string[] = [];
    for (const denom of ["pp", "gp", "sp", "cp"] as const) {
      const diff = (newCurrency[denom] ?? 0) - (oldCurrency[denom] ?? 0);
      if (diff !== 0) parts.push(`${diff > 0 ? "+" : ""}${diff} ${denom}`);
    }
    const summary = parts.length > 0 ? `Currency adjusted (${parts.join(", ")})` : "Currency adjusted";

    updated = await prisma.$transaction(async (tx) => {
      const result = await tx.character.update({
        where: { id: req.params.id },
        data: patchData,
        include: characterInclude,
      });
      await logEvent(tx, {
        characterId: req.params.id,
        category: "currency",
        type: "currencyAdjust",
        summary,
        before: { currency: oldCurrency },
        after: { currency: newCurrency },
        batchId: randomUUID(),
      });
      return result;
    });
  } else {
    updated = await prisma.character.update({
      where: { id: req.params.id },
      data: patchData,
      include: characterInclude,
    }) as typeof updated;
  }

  res.json(serializeCharacter(updated as Parameters<typeof serializeCharacter>[0]));
});

charactersRouter.delete("/characters/:id", async (req, res) => {
  await assertCharacterAccess(prisma, req.user!.id, req.params.id, "edit");

  // All child relations (CharacterRace, CharacterBackground, CharacterClassEntry,
  // InventoryItem, CharacterEvent/CharacterEventField, and their grandchildren)
  // are onDelete: Cascade in the schema, so a single delete is fully atomic.
  await prisma.character.delete({ where: { id: req.params.id } });
  res.status(204).end();
});
