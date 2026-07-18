import { experienceProgress, levelForExperience } from "@/lib/leveling/experience.js";
import { normalizeHitDice, normalizeHitPoints } from "@/lib/combat/hitpoints.js";
import {
  abilityModifier,
  advancementSlotsForLevel,
  deriveAttacksPerAction,
  deriveFeatBonuses,
  deriveFeatProficiencies,
  deriveSpellcasting,
  deriveMulticlassSpellcasting,
  derivePreparedSpellLimit,
  fightingStyleChoiceCount,
  type FightingStyleKey,
} from "@/lib/srd/srd.js";
import { deriveResources } from "@/lib/classes/class-features.js";
import { deriveActions, type AvailableAction } from "@/lib/classes/actions.js";
import { normalizeResourcesMutable, type AdvancementEntry } from "@/lib/classes/resources.js";
import { normalizeConditionsMutable } from "@/lib/combat/conditions.js";
import { normalizeActiveEffectsMutable } from "@/lib/combat/active-effects.js";
import { reverseAdvancementEffects } from "@/lib/leveling/advancement.js";
import { normalizeSpellcastingMutable } from "@/lib/spellcasting/spellcasting.js";
import type { SpellEntry } from "@/lib/spellcasting/spell-state.js";
import {
  deriveGrantedSpells,
  deriveGrantedCastingAbility,
  deriveItemSpells,
  type AbilityScores,
} from "@/lib/spellcasting/granted-spells.js";
import { SHADOW_ART_CONCENTRATION_PREFIX } from "@/lib/classes/shadow-arts.js";
import type { CharacterWithRelations } from "./character-include.js";
import { buildRollModifiers, buildTargetModifiers } from "./serialize/effects.js";
import {
  buildMergedArmorProficiencies,
  buildMergedWeaponProficiencies,
  buildSavingThrowProficiencies,
  buildSkillsView,
  buildToolProficienciesView,
  mergeItemWeaponProficiencies,
} from "./serialize/proficiencies.js";
import { buildInventoryContext, buildItemGrantsView, serializeInventoryItem } from "./serialize/inventory.js";
import {
  buildArmorClassView,
  buildSpeedView,
  buildUnarmedAttacksView,
  selectEquippedBodyArmor,
} from "./serialize/combat.js";

export { buildRollModifiers };

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
  return entries.flatMap((e) => deriveGrantedSpells(e.subclassRef, e.level));
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
  const granting = entries.find((e) => deriveGrantedSpells(e.subclassRef, e.level).length > 0);
  return deriveGrantedCastingAbility(granting?.subclassRef);
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

// Single-class caster view: derived stats (ability/DC/attack/slot totals),
// layered with stored mutable state (slotsUsed, spells, concentration)
// clamped to the derived caps.
function buildCasterSpellcastingView(
  row: CharacterWithRelations,
  derivedSpell: NonNullable<ReturnType<typeof deriveSpellcasting>>,
  granted: SpellEntry[],
  itemSpells: SpellEntry[],
): object {
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
// of Shadow monk's Minor Illusion). Slotless view so the grant renders; the
// casting ability is derived per rule (Wisdom is the default).
function buildGrantedOnlySpellcastingView(
  row: CharacterWithRelations,
  primaryClass: PrimaryClass,
  abilityScores: Record<string, number>,
  proficiencyBonus: number,
  granted: SpellEntry[],
  itemSpells: SpellEntry[],
): object {
  const stored = normalizeSpellcastingMutable(row.spellcasting);
  const castingAbility = deriveGrantedCastingAbility(primaryClass?.subclassRef);
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

// Fallback only for an already well-formed serialized blob (has `slots`). The
// compact mutable format ({ slotsUsed, spells }) that a non-caster or partial
// caster may have persisted is NOT renderable — leave spellcasting undefined
// so SpellsSection is skipped (Journal card renders instead of crashing with
// slots.filter on undefined). Currently inert for real data (no Warlock/
// Paladin/Ranger serialized blobs exist), but guards future half/third-caster
// additions.
function buildFallbackSpellcastingBlob(row: CharacterWithRelations): object | undefined {
  if (
    row.spellcasting !== null &&
    row.spellcasting !== undefined &&
    Array.isArray((row.spellcasting as { slots?: unknown }).slots)
  ) {
    return row.spellcasting as object;
  }
  return undefined;
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
  const view = buildSpellcastingViewBase(row, primaryClass, level, abilityScores, proficiencyBonus);
  if (view === undefined) return undefined;
  return { ...view, ...derivePreparedFields(view, preparedLimitEntries(row, primaryClass, level), abilityScores) };
}

// Class entries feeding the prepared-cap sum: single-class uses the XP-derived
// level (the per-class column can be stale); multiclass uses per-entry levels.
function preparedLimitEntries(
  row: CharacterWithRelations,
  primaryClass: PrimaryClass,
  level: number,
): Array<{ name: string; level: number; subclass: string | null }> {
  if (row.classEntries.length > 1) {
    return row.classEntries.map((e) => ({ name: e.name, level: e.level, subclass: e.subclass }));
  }
  return [{ name: primaryClass?.name ?? "", level, subclass: primaryClass?.subclass ?? null }];
}

// Derived prepared-spell cap fields (#883): the limit plus the current count.
// source==null excludes granted spells; level>0 excludes always-prepared cantrips.
function derivePreparedFields(
  view: object,
  entries: Array<{ name: string; level: number; subclass: string | null }>,
  abilityScores: Record<string, number>,
): { preparedSpellLimit: number | null; preparedSpellCount: number } {
  const raw = (view as { spells?: unknown }).spells;
  const spells: SpellEntry[] = Array.isArray(raw) ? raw : [];
  return {
    preparedSpellLimit: derivePreparedSpellLimit(entries, abilityScores),
    preparedSpellCount: spells.filter((s) => s.prepared && s.level > 0 && s.source == null).length,
  };
}

// The unadorned spellcasting view (slots/spells/ability), before the derived
// prepared-cap fields are layered on. Returns undefined for non-casters.
// Multiclass (2+ entries) merges caster levels into one slot pool + separate Pact
// Magic (#123); single-class output is left byte-for-byte identical below.
function buildSpellcastingViewBase(
  row: CharacterWithRelations,
  primaryClass: PrimaryClass,
  level: number,
  abilityScores: Record<string, number>,
  proficiencyBonus: number,
): object | undefined {
  if (row.classEntries.length > 1) {
    return buildMulticlassSpellcastingView(row, abilityScores, proficiencyBonus);
  }
  return buildSingleClassSpellcastingView(row, primaryClass, level, abilityScores, proficiencyBonus);
}

// Single-class spellcasting view: caster stats + slots, or a slotless
// granted-only view, or the legacy blob fallback. Uses the XP-derived level
// (the per-class column can be stale).
function buildSingleClassSpellcastingView(
  row: CharacterWithRelations,
  primaryClass: PrimaryClass,
  level: number,
  abilityScores: Record<string, number>,
  proficiencyBonus: number,
): object | undefined {
  const derivedSpell = deriveSpellcasting(
    primaryClass?.name ?? "",
    level,
    abilityScores,
    proficiencyBonus,
    primaryClass?.subclass ?? undefined,
  );
  const granted = deriveGrantedSpells(primaryClass?.subclassRef, level);
  const itemSpells = deriveItemSpellsFor(row); // #528: surfaced for any holder, caster or not.

  if (derivedSpell) {
    return buildCasterSpellcastingView(row, derivedSpell, granted, itemSpells);
  }
  if (granted.length > 0 || itemSpells.length > 0) {
    return buildGrantedOnlySpellcastingView(row, primaryClass, abilityScores, proficiencyBonus, granted, itemSpells);
  }
  return buildFallbackSpellcastingBlob(row);
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

  const resources = derivedRes
    ? buildResourcesPayload(
        derivedRes,
        normalizeResourcesMutable(row.resources),
        fightingStyle,
        fightingStyleChoices,
      )
    : undefined;

  return { resources, fightingStyle, fightingStyleChoiceCount: fightingStyleChoices };
}

// Assemble the wire `resources` payload from the derived caps + stored mutable
// state, clamping each level-gated list to its derived count (defense-in-depth
// for characters who haven't had a reconciling XP op since their level dropped).
// Byte-identical to the former inline construction (feeds the serialize oracle).
function buildResourcesPayload(
  derivedRes: NonNullable<ReturnType<typeof deriveResources>>,
  stored: ReturnType<typeof normalizeResourcesMutable>,
  fightingStyle: FightingStyleKey | null,
  fightingStyleChoiceCount: number,
): object {
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
  // Generic subclass "choose N" clamp-on-read (#899): keep only keys the derived
  // subclassChoices still grant, each capped to its count — defense-in-depth
  // mirroring reconcileSubclassChoices for characters not yet reconciled.
  const subclassChoices = derivedRes.subclassChoices ?? [];
  const choiceCaps = new Map(subclassChoices.map((c) => [c.key, c.count]));
  const clampedChoicesKnown: Record<string, typeof stored.choicesKnown[string]> = {};
  for (const [key, entries] of Object.entries(stored.choicesKnown)) {
    const cap = choiceCaps.get(key) ?? 0;
    if (cap > 0) clampedChoicesKnown[key] = entries.slice(0, cap);
  }
  return {
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
    // Generic subclass "choose N" surface (#899): the derived choices (key/label/
    // count/catalogSource) tell the level-up Choose-N step which pickers to render;
    // choicesKnown holds the (clamped) selections.
    subclassChoices,
    choicesKnown: clampedChoicesKnown,
    // Fighting Style choice surface for the frontend picker. Choice count is
    // level-gated (Fighter L1 -> 1); fightingStyle is already clamped to null
    // when the character isn't entitled.
    fightingStyleChoiceCount,
    fightingStyle,
  };
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
  const conditions = normalizeConditionsMutable(row.conditions);
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
    conditions,
    // Active cast-granted passive modifiers (buffs). Normalized on read; each is
    // also summed into its target skill/stat's tempModifier above.
    activeEffects,
    // State-driven advantage/disadvantage grants (#486), derived from active
    // conditions + buffs. The frontend resolves the effective mode per roll.
    rollModifiers: buildRollModifiers(conditions, activeEffects),

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
