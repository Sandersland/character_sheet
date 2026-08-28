import { experienceProgress, levelForExperience } from "@/lib/leveling/experience.js";
import { normalizeHitDice, normalizeHitPoints } from "@/lib/combat/hitpoints.js";
import {
  carriedWeight,
  carryingCapacity,
  deriveAttacksPerAction,
  deriveCritRange,
  deriveRangedAttackRollBonus,
  exhaustionEffectText,
} from "@/lib/srd/srd.js";
import { ATTUNEMENT_LIMIT } from "@/lib/inventory/inventory-attunement.js";
import { currencyOrEmpty } from "@/lib/inventory/inventory-currency.js";
import { sneakAttackSpecForEntries } from "@/lib/classes/sneak-attack.js";
import { monkSaveDC } from "@/lib/classes/ki-focus.js";
import { hasStunningStrike } from "@/lib/classes/stunning-strike.js";
import { QUIVERING_PALM_BUFF_KEY, hasQuiveringPalm } from "@/lib/classes/quivering-palm.js";
import { hasOpenHandTechnique } from "@/lib/classes/open-hand-technique.js";
import { resolveSubclassSlug, type SubclassIdentityInput } from "@/lib/classes/subclass-slug.js";
import { assassinateEligible } from "@/lib/classes/assassinate.js";
import { weaponBondEligible, WEAPON_BOND_LIMIT } from "@/lib/classes/weapon-bond.js";
import { featureRowsOf } from "@/lib/classes/feature-rows-select.js";
import { normalizeConditionsMutable, deriveImmuneConditions, immuneConditionEntryRows } from "@/lib/combat/conditions.js";
import { normalizeActiveEffectsMutable, type ActiveEffectsMutableState } from "@/lib/combat/active-effects.js";
import { isOffHandLocked } from "@/lib/inventory/inventory-placement.js";
import { RULES_EDITION_LABELS, editionOf } from "@/lib/rules/edition.js";
import { portraitKeyVersion } from "@/lib/storage/portrait-blob.js";
import type { DiceRider, RulesEdition, SaveRider } from "@character-sheet/shared-types";
import { resolveCharacterInventory, type CharacterRow, type CharacterWithRelations } from "./character-include.js";
import { buildRollModifiers, buildTargetModifiers } from "./serialize/effects.js";
import {
  buildMergedArmorProficiencies,
  buildMergedWeaponProficiencies,
  buildSavingThrowProficiencies,
  buildSkillsView,
  buildToolProficienciesView,
  mergeItemWeaponProficiencies,
} from "./serialize/proficiencies.js";
import { buildAttackRowsView } from "./serialize/attack-rows.js";
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
import { attachSpellCatalogMeta } from "./serialize/spell-catalog.js";
import { buildSpeciesTraitsView } from "./serialize/species.js";
import type { SpellEntry } from "@/lib/spellcasting/spell-state.js";

export { buildRollModifiers };

// Riders (#1316): bolt-on effects with no action economy of their own. Each
// returns undefined off-gate so serializeCharacter spreads it in only when
// present — absent keys, never null ones.

// sneakAttackSpecForEntries is the one place the "which class entry is the
// rogue" lookup lives (#1231).
function sneakAttackRider(classEntries: { name: string; level: number }[]): DiceRider | undefined {
  const spec = sneakAttackSpecForEntries(classEntries);
  return spec ? { dice: { count: spec.count, faces: spec.faces } } : undefined;
}

// hasStunningStrike is the single source of the L5 threshold (#1337), also
// consumed by that module's own cast guard.
function stunningStrikeRider(
  classEntries: { name: string; level: number }[],
  abilityScores: Record<string, number>,
  profBonus: number,
): SaveRider | undefined {
  const monkLevel = classEntries.find((c) => c.name.toLowerCase() === "monk")?.level ?? 0;
  return hasStunningStrike(monkLevel) ? { saveDC: monkSaveDC(abilityScores, profBonus) } : undefined;
}

type RiderClassEntry = SubclassIdentityInput & { name: string; level: number };

// SRD 5.2 "Warrior of the Open Hand" and SRD 5.1 "Way of the Open Hand"
// (#1501) are separate subclasses, not one forked across editions.
const OPEN_HAND_SLUGS = ["monk-warrior-of-the-open-hand", "monk-way-of-the-open-hand"];

// resolveSubclassSlug prefers the FK, exact name as fallback (#1277).
function openHandMonkEntry(classEntries: RiderClassEntry[]): RiderClassEntry | undefined {
  const monk = classEntries.find((c) => c.name.toLowerCase() === "monk");
  const slug = monk && resolveSubclassSlug("monk", monk);
  return slug && OPEN_HAND_SLUGS.includes(slug) ? monk : undefined;
}

// hasOpenHandTechnique is the single source of the L3 threshold (#1337).
// Addle carries no save, but saveDC stays present for shape uniformity.
function openHandTechniqueRider(
  classEntries: RiderClassEntry[],
  abilityScores: Record<string, number>,
  profBonus: number,
): SaveRider | undefined {
  const monk = openHandMonkEntry(classEntries);
  return monk && hasOpenHandTechnique(monk.level) ? { saveDC: monkSaveDC(abilityScores, profBonus) } : undefined;
}

// hasQuiveringPalm is the single source of the L17 threshold (#1337).
// `active` reads the activeEffects buff registry's QUIVERING_PALM_BUFF_KEY
// marker, not new persisted state.
function quiveringPalmRider(
  classEntries: RiderClassEntry[],
  abilityScores: Record<string, number>,
  profBonus: number,
  activeEffects: ActiveEffectsMutableState,
): SaveRider | undefined {
  const monk = openHandMonkEntry(classEntries);
  if (!monk || !hasQuiveringPalm(monk.level)) return undefined;
  return {
    saveDC: monkSaveDC(abilityScores, profBonus),
    active: activeEffects.buffs.some((b) => b.key === QUIVERING_PALM_BUFF_KEY),
  };
}

// assassinateEligible is the one gate resolve-action's op validation and
// this rider both call (#1526).
function assassinateRider(classEntries: RiderClassEntry[], edition: RulesEdition): true | undefined {
  return assassinateEligible(classEntries, edition) ? true : undefined;
}

// Kept separate so adding a rider's gate doesn't grow serializeCharacter's
// own branching.
function buildRiderView(
  classEntries: RiderClassEntry[],
  abilityScores: Record<string, number>,
  profBonus: number,
  activeEffects: ActiveEffectsMutableState,
  announcedSaveDC: number | undefined,
  edition: RulesEdition,
): {
  sneakAttack?: DiceRider;
  stunningStrike?: SaveRider;
  openHandTechnique?: SaveRider;
  quiveringPalm?: SaveRider;
  maneuvers?: SaveRider;
  assassinate?: true;
} {
  const sneakAttack = sneakAttackRider(classEntries);
  const stunningStrike = stunningStrikeRider(classEntries, abilityScores, profBonus);
  const openHandTechnique = openHandTechniqueRider(classEntries, abilityScores, profBonus);
  const quiveringPalm = quiveringPalmRider(classEntries, abilityScores, profBonus, activeEffects);
  const assassinate = assassinateRider(classEntries, edition);
  return {
    ...(sneakAttack ? { sneakAttack } : {}),
    ...(stunningStrike ? { stunningStrike } : {}),
    ...(openHandTechnique ? { openHandTechnique } : {}),
    ...(quiveringPalm ? { quiveringPalm } : {}),
    ...(assassinate ? { assassinate } : {}),
    // maneuverChoiceCount/toolProfChoiceCount stay in `resources` —
    // load-bearing for buildResourcesView's clamp-on-read. `announcedSaveDC`
    // (#1589) is a generic ClassExtras field; a future rider reading it must
    // use its OWN rider name, never a second `maneuvers`-shaped consumer.
    ...(announcedSaveDC !== undefined ? { maneuvers: { saveDC: announcedSaveDC } } : {}),
  };
}

// RELATIVE path keeps this same-origin under the dev proxy and prod, and
// satisfies the CSP's imgSrc 'self'. `?v=` is the blob key's uuid — a
// re-upload mints a new one, enabling Cache-Control: immutable (#1615).
function derivePortraitUrl(row: { id: string; portraitKey: string | null }): string | undefined {
  if (!row.portraitKey) return undefined;
  return `/api/characters/${row.id}/portrait?v=${portraitKeyVersion(row.portraitKey)}`;
}

export function serializeCharacterSummary(row: {
  id: string;
  name: string;
  ownerId: string;
  campaignId: string | null;
  portraitKey: string | null;
  experiencePoints: number;
  raceSelection: { name: string } | null;
  classEntries: { name: string; level: number }[];
}) {
  return {
    id: row.id,
    name: row.name,
    // ownerId is legitimately persisted (Character.ownerId); access is
    // enforced via assertCharacterAccess, not by omitting this field.
    ownerId: row.ownerId,
    // Lets the campaign add-picker exclude characters already in another
    // campaign (#246).
    campaignId: row.campaignId ?? undefined,
    // raceSelection/classEntries are optional in Prisma's types only because
    // they're the non-FK side of the relation — every character created via
    // POST /characters has exactly one of each.
    race: row.raceSelection?.name ?? "",
    class: row.classEntries[0]?.name ?? "",
    // Every class entry so the card can render a multiclass line
    // ("Wizard 5 / Cleric 3"); `class` above stays the primary.
    classes: row.classEntries.map((e) => ({ name: e.name, level: e.level })),
    level: levelForExperience(row.experiencePoints),
    portraitUrl: derivePortraitUrl(row),
  };
}

// Json columns (hitPoints, hitDice, abilityScores, skills, currency,
// spellcasting) round-trip as-is — written by our own seed/PATCH/POST path,
// not external input. serializeWeaponDetail/serializeArmorDetail/
// serializeConsumableDetail are shared with itemsRouter's catalog reads.

// Newest-first ordering happens in the include, not here.
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

function buildCampaignPreferencesView(row: CharacterWithRelations) {
  if (row.campaignId == null) return undefined;
  const pref = row.campaignPreferences.find((p) => p.campaignId === row.campaignId);
  return {
    shareWithDm: pref?.shareWithDm ?? false,
    autoFriendlyHealing: pref?.autoFriendlyHealing ?? false,
  };
}

// Every shape buildSpellcastingView can return carries a `spells` array under
// the same key, so this reads/replaces that one field generically rather
// than re-deriving per view shape (#1798).
async function decorateSpellcastingCatalog(
  row: CharacterWithRelations,
  spellcasting: object | undefined,
): Promise<object | undefined> {
  if (spellcasting === undefined) return undefined;
  const raw = (spellcasting as { spells?: unknown }).spells;
  if (!Array.isArray(raw)) return spellcasting;
  const decorated = await attachSpellCatalogMeta(row, raw as SpellEntry[]);
  return { ...spellcasting, spells: decorated };
}

export async function serializeCharacter(rawRow: CharacterRow) {
  // resolveCharacterInventory reconstructs weaponDetail/armorDetail/
  // consumableDetail from `snapshot` (#1649) — the only place this shape
  // shift happens; builders below stay unchanged.
  const row = resolveCharacterInventory(rawRow);
  // Derivation order below: later steps read earlier outputs; do not reorder.
  const progress = experienceProgress(row.experiencePoints);
  const primaryClass = row.classEntries[0];
  const normalizedHitPoints = normalizeHitPoints(row.hitPoints);
  const hitDice = normalizeHitDice(row.hitDice);
  const abilityScoresMap = row.abilityScores as Record<string, number>;

  // buildSpellcastingView/buildResourcesView clamp stored state to
  // level-derived caps — the read-side mirror of LEVEL_GATED_RECONCILERS.
  const spellcastingBase = buildSpellcastingView(
    row,
    primaryClass,
    progress.level,
    abilityScoresMap,
    progress.proficiencyBonus,
  );
  const spellcasting = await decorateSpellcastingCatalog(row, spellcastingBase);
  const { resources, announcedSaveDC, classFeatureImprovements } = buildResourcesView(
    row,
    progress.level,
    abilityScoresMap,
    progress.proficiencyBonus,
  );
  // Species traits need no level/edition gating of their own — a trait row is
  // always active once picked; edition forking already happened at the
  // Species row level (#1682).
  const speciesTraits = buildSpeciesTraitsView(row);

  // conditions (exhaustion) must be read before applyFeatLayer: effectiveMaxHp
  // composes the feat bonus with exhaustion's PHB'14 p. 291 tier-4 halving, so
  // the feat layer needs the exhaustion level already in hand.
  const conditions = normalizeConditionsMutable(row.conditions);
  const {
    effectiveScores,
    hitPoints,
    effectiveInitBonus,
    clampedAdvancements,
    advSlotTotal,
    usedSlots,
    fightingStyleSlotTotal,
    usedFightingStyleSlots,
    fightingStyleGrantingClasses,
  } = applyAdvancementClamp(row, progress.level, normalizedHitPoints);
  const { featBonuses, effectiveMaxHp, featProficiencies } = applyFeatLayer(
    clampedAdvancements,
    classFeatureImprovements,
    speciesTraits.improvements,
    hitDice.total,
    hitPoints.max,
    conditions.exhaustion,
    row.classEntries,
    progress.level,
    editionOf(row),
  );

  // Pre-compute weapon proficiency grants so they can be reused both in the
  // inventory serialisation (attack-bonus derivation) and the wire response.
  const weaponGrants = buildMergedWeaponProficiencies(row.classEntries, featProficiencies.weapons);
  const activeEffects = normalizeActiveEffectsMutable(row.activeEffects);
  const buffTargets = buildTargetModifiers(row, activeEffects);
  // deriveImmuneConditions is the same shared rule function the conditions
  // write-guard calls (#1121) — the sheet can never show a condition
  // available that the endpoint would reject.
  const immuneConditions = deriveImmuneConditions(
    immuneConditionEntryRows(row.classEntries, progress.level),
    editionOf(row),
    activeEffects,
  );
  const { itemGrants, itemSkillProfs, itemSaveProfs } = buildItemGrantsView(row);
  const rangedAttackRollBonus = deriveRangedAttackRollBonus(clampedAdvancements);
  // Bound here (not inlined below) so the per-row `proficient` flag reads the
  // exact merged list the wire array shows — the un-merged weaponGrants would
  // re-warn on an item-granted proficiency (#1433).
  const armorGrants = buildMergedArmorProficiencies(row.classEntries, featProficiencies.armor);
  const itemMergedWeaponGrants = mergeItemWeaponProficiencies(
    weaponGrants,
    itemGrants.proficiencies.filter((p) => p.profType === "weapon"),
  );
  const inventoryContext = buildInventoryContext(
    row,
    effectiveScores,
    progress.proficiencyBonus,
    weaponGrants,
    itemMergedWeaponGrants,
    armorGrants,
    rangedAttackRollBonus,
    buffTargets,
  );
  // Bound rather than inlined in the response literal so buildAttackRowsView can
  // compose its rows from the SAME serialized rows the sheet renders (#1434).
  const inventory = row.inventoryItems.map((item) => serializeInventoryItem(item, inventoryContext));

  const { bestArmor, hasShield } = selectEquippedBodyArmor(row, effectiveScores);
  // Martial Arts' unarmed-strike gate needs "no armor or Shield" — computed
  // once here since buildAvailableActionsView isn't its only consumer (#1218).
  const unarmoredUnshielded = bestArmor == null && !hasShield;
  // weaponBondEligible is the same rule function reconcileWeaponBond and the
  // bond/unbond transaction op call (#1854). A stale `weaponBonded` flag on a
  // character who's lost eligibility reads as 0 here until reconcileWeaponBond
  // clears it on the next XP transaction.
  const bondedWeaponCount = weaponBondEligible(row.classEntries, progress.level, editionOf(row)).eligible
    ? row.inventoryItems.filter((item) => item.weaponBonded).length
    : 0;
  const { armorClass, armorClassBreakdown } = buildArmorClassView(
    row,
    effectiveScores,
    bestArmor,
    hasShield,
    clampedAdvancements,
    featBonuses,
    buffTargets,
    editionOf(row),
  );
  const { speed, flySpeed } = buildSpeedView(
    row,
    bestArmor,
    hasShield,
    featBonuses,
    buffTargets,
    conditions.exhaustion,
    progress.level,
    editionOf(row),
  );
  const unarmedAttacks = buildUnarmedAttacksView(
    row,
    effectiveScores,
    progress.proficiencyBonus,
    clampedAdvancements,
    weaponGrants,
    bestArmor,
    hasShield,
  );
  const { unarmedStrike, improvisedWeapon } = unarmedAttacks;
  const attackRows = buildAttackRowsView(inventory, unarmedAttacks, clampedAdvancements);

  const riders = buildRiderView(
    row.classEntries,
    effectiveScores,
    progress.proficiencyBonus,
    activeEffects,
    announcedSaveDC,
    editionOf(row),
  );

  return {
    id: row.id,
    name: row.name,
    ownerId: row.ownerId,
    race: row.raceSelection?.name ?? "",
    class: primaryClass?.name ?? "",
    subclass: primaryClass?.subclass ?? undefined,
    subclassId: primaryClass?.subclassId ?? undefined,
    level: progress.level,
    background: row.backgroundSelection?.name ?? "",
    alignment: row.alignment,
    portraitUrl: derivePortraitUrl(row),
    campaignId: row.campaignId ?? undefined,
    rulesEdition: row.rulesEdition,
    // Served alongside the key (#1436) so the edition badge stays
    // synchronous — no client copy of the label table, no extra round-trip.
    rulesEditionLabel: RULES_EDITION_LABELS[editionOf(row)],
    campaignPreferences: buildCampaignPreferencesView(row),

    armorClass,
    armorClassBreakdown,
    initiativeBonus: effectiveInitBonus + featBonuses.initiative,
    speed,
    // Dragon Wings (PHB'14 p.107, #1123) — 2014 only; the 2024 form is a
    // resource-gated activated ability, withheld here. Absent (never 0) when
    // not flying, same convention as the riders above.
    flySpeed,
    proficiencyBonus: progress.proficiencyBonus,

    experiencePoints: row.experiencePoints,
    currentLevelThreshold: progress.currentLevelThreshold,
    nextLevelThreshold: progress.nextLevelThreshold,
    // hitDice.total tracks how many levels have had HP applied via the /hp
    // endpoint; pendingLevelUps is the gap versus the XP-derived level.
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
    skills: buildSkillsView(row, featProficiencies, itemSkillProfs, buffTargets, resources),
    toolProficiencies: buildToolProficienciesView(row, resources, itemGrants),
    // Armor/weapon proficiencies — derived fully at read time from class,
    // species-trait, and feat grants. Deduped with precedence class > feat, so
    // a re-granted proficiency renders once.
    armorProficiencies: armorGrants,
    weaponProficiencies: itemMergedWeaponGrants,
    inventory,
    currency: row.currency,
    // Reads `effectiveScores`, not row.abilityScores — the post-clamp score is
    // what the wire reports as `abilityScores`, so the raw column would
    // disagree after a STR ASI (#1377).
    carryCapacity: carryingCapacity(effectiveScores.strength),
    carriedWeight: carriedWeight(row.inventoryItems, currencyOrEmpty(row.currency)),
    // Same constant the attune path's 409 rejects on.
    attunementCap: ATTUNEMENT_LIMIT,
    // Same constant the bond endpoint's 409 rejects on (#1854).
    weaponBondCap: WEAPON_BOND_LIMIT,
    spellcasting,
    resources,
    // Normalized on read (unknown keys dropped, exhaustion clamped 0–6);
    // mutated only via POST .../conditions/transactions.
    conditions,
    // Resolved per this character's edition (#1322) so it can never
    // contradict `speed`/`rollModifiers`. NOT folded into `conditions` — that
    // object is also the write shape and audit payload; a derived string has
    // no business there.
    exhaustionEffectText: exhaustionEffectText(conditions.exhaustion, editionOf(row)),
    // NOT folded into `conditions` — derived, never persisted (same as
    // exhaustionEffectText) (#1121).
    immuneConditions,
    activeEffects,
    // The frontend resolves the effective per-roll mode from these grants (#486).
    rollModifiers: buildRollModifiers(conditions, activeEffects, editionOf(row)),

    // resistances also feeds the #456 auto-halve at damage-apply time; the
    // rest render as item-sourced flags/reminders (#529).
    resistances: itemGrants.resistances.map((r) => ({ damageType: r.value, source: r.source })),
    damageImmunities: itemGrants.immunities.map((i) => ({ damageType: i.value, source: i.source })),
    conditionImmunities: itemGrants.conditionImmunities.map((c) => ({ condition: c.value, source: c.source })),
    grantedAdvantages: itemGrants.advantages,
    grantedProficiencies: itemGrants.proficiencies,

    // Top-level so every class sees them, independent of whether
    // deriveResources returns a non-null value.
    advancements: clampedAdvancements,
    advancementSlots: {
      total: advSlotTotal,
      // Origin feats + Fighting Style feats don't consume an ASI slot
      // (#1130/#1137) — count only ASI-partition entries.
      used: usedSlots,
    },
    // Separate partition from ASI slots (#1137).
    fightingStyleSlots: {
      total: fightingStyleSlotTotal,
      used: usedFightingStyleSlots,
    },
    // The level-gated subset that has EARNED Fighting Style at this level,
    // never `character.classes` as a whole — matches exactly what
    // resolveCatalogFeat enforces on write, so a served option can never 400
    // (#1495).
    fightingStyleGrantingClasses,

    // Class-specific actions only — universal ones ride GET /api/reference
    // instead, resolved per edition (#1430).
    availableActions: buildAvailableActionsView(
      row.classEntries,
      progress.level,
      resources,
      unarmoredUnshielded,
      editionOf(row),
      effectiveScores,
      // Off-hand eligibility input (#1435): the light flags of the equipped
      // weapons, read off the SAME serialized inventory the attack rows use.
      inventory
        .filter((item) => item.category === "weapon" && item.equipped && item.weapon)
        .map((item) => ({ light: Boolean(item.weapon?.light) })),
      bondedWeaponCount,
    ),

    // Derived at read time (#1434). unarmedStrike/improvisedWeapon stay on
    // the payload too — other surfaces read them directly; attackRows'
    // matching entries are built FROM them.
    unarmedStrike,
    improvisedWeapon,
    attackRows,
    // featureRowsOf is the same carrier extractor buildResourcesView and
    // buildAvailableActionsView already use (#1530).
    attacksPerAction: deriveAttacksPerAction(row.classEntries, editionOf(row), featureRowsOf),
    // Edition-invariant (SRD 5.1 p.25 / SRD 5.2 p.49 agree on level and
    // threshold) — deriveCritRange itself takes no `edition`; editionOf(row)
    // here is only the row filter every derivedStat reader takes (#1120).
    critRange: deriveCritRange(row.classEntries, editionOf(row), featureRowsOf),
    // Distinct from `offHandBusy` (buildInventoryContext's internal): that one
    // is true for a shield OR a second weapon and only picks a versatile
    // weapon's die; offHandLocked says nothing may occupy the off-hand at all
    // (#1433).
    offHandLocked: isOffHandLocked(row.inventoryItems),
    ...riders,

    // Announce-only per owner ruling, not a derived combat stat — darkvision
    // renders like any other trait. [] for a legacy race-name-only character
    // (no species picked, #1679); the section handles an empty list, never a
    // crash.
    speciesTraits: speciesTraits.traits,

    journal: buildJournalView(row),

    // Level + subclass clamps-on-read (#124/#125).
    classes: buildClassesView(row, progress.level),
  };
}
