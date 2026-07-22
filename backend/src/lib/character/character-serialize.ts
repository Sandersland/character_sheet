import { experienceProgress, levelForExperience } from "@/lib/leveling/experience.js";
import { normalizeHitDice, normalizeHitPoints } from "@/lib/combat/hitpoints.js";
import { deriveAttacksPerAction, deriveRangedAttackRollBonus } from "@/lib/srd/srd.js";
import { sneakAttackSpec } from "@/lib/classes/rogue.js";
import { focusSaveDC } from "@/lib/classes/monk.js";
import { QUIVERING_PALM_BUFF_KEY } from "@/lib/classes/quivering-palm.js";
import { normalizeConditionsMutable } from "@/lib/combat/conditions.js";
import { normalizeActiveEffectsMutable, type ActiveEffectsMutableState } from "@/lib/combat/active-effects.js";
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
import {
  applyAdvancementClamp,
  applyFeatLayer,
  buildAvailableActionsView,
  buildClassesView,
  buildResourcesView,
} from "./serialize/classes.js";
import { buildSpellcastingView } from "./serialize/spellcasting.js";

export { buildRollModifiers };

// Sneak Attack wire shape: the Nd6 dice count + faces, or null for a non-rogue.
// Scales with rogue class levels, matching applySneakAttackOperations.
function serializeSneakAttack(
  classEntries: { name: string; level: number }[],
): { dice: number; faces: number } | null {
  const spec = sneakAttackSpec(classEntries.find((c) => c.name.toLowerCase() === "rogue")?.level ?? 0);
  return spec ? { dice: spec.count, faces: spec.faces } : null;
}

// Stunning Strike wire shape: the focus save DC, or null below monk L5. Mirrors
// serializeSneakAttack's gate-by-class-level shape; scales with the monk class
// entry's own level, matching monkLevel() in stunning-strike.ts.
function serializeStunningStrike(
  classEntries: { name: string; level: number }[],
  abilityScores: Record<string, number>,
  profBonus: number,
): { dc: number } | null {
  const monkLevel = classEntries.find((c) => c.name.toLowerCase() === "monk")?.level ?? 0;
  return monkLevel >= 5 ? { dc: focusSaveDC(abilityScores, profBonus) } : null;
}

// Warrior of the Open Hand's monk class entry, or undefined off-subclass —
// shared by serializeOpenHandTechnique/serializeQuiveringPalm so both gate on
// the same (freeform, substring-matched) subclass string, mirroring
// DERIVED_ACTIONS' grantSubclass convention in lib/classes/actions.ts.
function openHandMonkEntry(
  classEntries: { name: string; level: number; subclass?: string | null }[],
): { name: string; level: number; subclass?: string | null } | undefined {
  const monk = classEntries.find((c) => c.name.toLowerCase() === "monk");
  return monk && (monk.subclass ?? "").toLowerCase().includes("open hand") ? monk : undefined;
}

// Open Hand Technique wire shape (Warrior of the Open Hand L3, #1245): the
// focus save DC for the Push/Topple riders, or null below monk L3 off-subclass.
// Addle carries no save, but the shape stays uniform (dc is always present once
// unlocked) — live-play automation lives in open-hand-technique.ts.
function serializeOpenHandTechnique(
  classEntries: { name: string; level: number; subclass?: string | null }[],
  abilityScores: Record<string, number>,
  profBonus: number,
): { dc: number } | null {
  const monk = openHandMonkEntry(classEntries);
  return monk && monk.level >= 3 ? { dc: focusSaveDC(abilityScores, profBonus) } : null;
}

// Quivering Palm wire shape (Warrior of the Open Hand L17, #1245): the focus
// save DC for the Con-save trigger, plus whether vibrations are currently set
// (the activeEffects buff registry's inert QUIVERING_PALM_BUFF_KEY marker — see
// quivering-palm.ts's header for why a buff, not new persisted state).
function serializeQuiveringPalm(
  classEntries: { name: string; level: number; subclass?: string | null }[],
  abilityScores: Record<string, number>,
  profBonus: number,
  activeEffects: ActiveEffectsMutableState,
): { dc: number; active: boolean } | null {
  const monk = openHandMonkEntry(classEntries);
  if (!monk || monk.level < 17) return null;
  return {
    dc: focusSaveDC(abilityScores, profBonus),
    active: activeEffects.buffs.some((b) => b.key === QUIVERING_PALM_BUFF_KEY),
  };
}

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
// table, mutated only via journalRouter and mapped to the wire shape below.)
// inventory is the exception: it's relational (InventoryItem rows, see
// schema.prisma), mapped into the same JSON shape the frontend already
// expects below. weaponDetail/armorDetail/consumableDetail (at most one
// present, matching `category`) nest as nullable `weapon`/`armor`/
// `consumable` sub-objects via the shared serializeWeaponDetail/serializeArmorDetail/
// serializeConsumableDetail (also used by itemsRouter for the catalog) rather than flattening
// back out — `id`/the owning FK aren't meaningful to the client.

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
  // Derivation order below: later steps read earlier outputs; do not reorder.
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
  const { resources } = buildResourcesView(
    row,
    progress.level,
    abilityScoresMap,
    progress.proficiencyBonus,
  );

  // 3. Advancement clamp → effective scores/HP/initiative, then the feat layer
  //    summed over the kept advancements (origin feats + slot-bounded entries).
  const { effectiveScores, hitPoints, effectiveInitBonus, clampedAdvancements, advSlotTotal, usedSlots, fightingStyleSlotTotal, usedFightingStyleSlots } =
    applyAdvancementClamp(row, progress.level, normalizedHitPoints);
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
  // Archery Fighting Style feat (#1137): +2 to ranged attack rolls, summed from
  // the kept advancements' rangedAttackRoll improvements.
  const rangedAttackRollBonus = deriveRangedAttackRollBonus(clampedAdvancements);
  const inventoryContext = buildInventoryContext(
    row,
    effectiveScores,
    progress.proficiencyBonus,
    weaponGrants,
    rangedAttackRollBonus,
    buffTargets,
  );

  // 5. Equipped-armor selection feeds AC, speed (Unarmored/Fast Movement), and
  //    the Monk unarmed strike — all derived, never persisted.
  const { bestArmor, hasShield } = selectEquippedBodyArmor(row, effectiveScores);
  // Martial Arts blanket condition (Monk Bonus Unarmed Strike, #1218): no armor
  // or Shield. Computed once here — `deriveActions` is the first consumer, but
  // the flag is generic (`requiresUnarmored`) so future gated features share it.
  const unarmoredUnshielded = bestArmor == null && !hasShield;
  const { armorClass, armorClassBreakdown } = buildArmorClassView(
    row,
    effectiveScores,
    bestArmor,
    hasShield,
    clampedAdvancements,
    featBonuses,
    buffTargets,
  );
  const speed = buildSpeedView(row, bestArmor, hasShield, featBonuses, buffTargets, conditions.exhaustion);
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
      // Origin feats + Fighting Style feats don't consume an ASI slot (#1130/#1137)
      // — count only ASI-partition entries.
      used: usedSlots,
    },
    // Fighting Style feat slots (#1137): a partition separate from ASI slots
    // (Fighter L1, Paladin/Ranger L2). The sheet gates its style picker on total.
    fightingStyleSlots: {
      total: fightingStyleSlotTotal,
      used: usedFightingStyleSlots,
    },

    // Class-specific available actions for the turn tracker (universal ones
    // render client-side from UNIVERSAL_ACTIONS).
    availableActions: buildAvailableActionsView(primaryClass, progress.level, resources, unarmoredUnshielded),

    // Combat attack rows — derived at read time; the frontend renders these
    // directly in AttacksPanel rather than recomputing attack math on the client.
    unarmedStrike,
    improvisedWeapon,
    // Weapon attacks per Attack action (Extra Attack), max across multiclass.
    attacksPerAction: deriveAttacksPerAction(row.classEntries),
    // Rogue Sneak Attack Nd6 (derived from rogue class levels); null otherwise.
    // The count drives the session card's toggle + the roll shown in results.
    sneakAttack: serializeSneakAttack(row.classEntries),
    // Monk Stunning Strike focus save DC (derived from monk class level + Wis);
    // null below monk L5. Drives the session card's DC display (#1242).
    stunningStrike: serializeStunningStrike(row.classEntries, effectiveScores, progress.proficiencyBonus),
    // Warrior of the Open Hand riders (#1245): focus save DC once unlocked, or
    // null off-subclass/below the gate level. See open-hand-technique.ts /
    // quivering-palm.ts for the live-play automation.
    openHandTechnique: serializeOpenHandTechnique(row.classEntries, effectiveScores, progress.proficiencyBonus),
    quiveringPalm: serializeQuiveringPalm(row.classEntries, effectiveScores, progress.proficiencyBonus, activeEffects),

    journal: buildJournalView(row),

    // Multiclass-aware per-class view with the level + subclass clamps-on-read
    // (issues #124/#125) — see buildClassesView.
    classes: buildClassesView(row, progress.level),
  };
}
