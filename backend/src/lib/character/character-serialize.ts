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
import { monkSaveDC } from "@/lib/classes/monk.js";
import { hasStunningStrike } from "@/lib/classes/stunning-strike.js";
import { QUIVERING_PALM_BUFF_KEY, hasQuiveringPalm } from "@/lib/classes/quivering-palm.js";
import { hasOpenHandTechnique } from "@/lib/classes/open-hand-technique.js";
import { resolveSubclassSlug, type SubclassIdentityInput } from "@/lib/classes/subclass-slug.js";
import { assassinateEligible } from "@/lib/classes/assassinate.js";
import { featureRowsOf } from "@/lib/classes/feature-rows-select.js";
import { normalizeConditionsMutable } from "@/lib/combat/conditions.js";
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

// Riders (#1316): bolt-on effects that piggyback on an attack or a hit and
// cost no action economy of their own (see `DERIVED_ACTIONS` for why they
// never live there). Each returns undefined off-class/subclass/level so
// serializeCharacter can spread it in only when present — absent keys, never
// null ones.

// Sneak Attack: the Nd6 dice spec, undefined for a non-rogue. Scales with
// rogue class levels, matching applySneakAttackOperations — both now go
// through sneak-attack.ts's sneakAttackSpecForEntries (#1231 commit 3), which
// is the one place the "which class entry is the rogue" lookup lives.
function sneakAttackRider(classEntries: { name: string; level: number }[]): DiceRider | undefined {
  const spec = sneakAttackSpecForEntries(classEntries);
  return spec ? { dice: { count: spec.count, faces: spec.faces } } : undefined;
}

// Stunning Strike: the focus save DC, undefined below the gate. Scales with
// the monk class entry's own level, gated through hasStunningStrike (#1337:
// the single source of the L5 threshold, also consumed by that module's own
// cast guard).
function stunningStrikeRider(
  classEntries: { name: string; level: number }[],
  abilityScores: Record<string, number>,
  profBonus: number,
): SaveRider | undefined {
  const monkLevel = classEntries.find((c) => c.name.toLowerCase() === "monk")?.level ?? 0;
  return hasStunningStrike(monkLevel) ? { saveDC: monkSaveDC(abilityScores, profBonus) } : undefined;
}

type RiderClassEntry = SubclassIdentityInput & { name: string; level: number };

// Both editions' Open Hand subclasses grant Open Hand Technique/Quivering
// Palm — "Warrior of the Open Hand" (SRD 5.2, EDITION_2024) and "Way of the
// Open Hand" (SRD 5.1, EDITION_2014, #1501) are SEPARATE subclasses, not one
// forked across editions, so a character resolves to at most one of the two.
const OPEN_HAND_SLUGS = ["monk-warrior-of-the-open-hand", "monk-way-of-the-open-hand"];

// The Open Hand monk's own class entry, or undefined off-subclass — shared by
// openHandTechniqueRider/quiveringPalmRider. Resolved via slug (#1277: FK
// preferred, exact name as fallback) — was substring-matched on the words
// "open hand", the same failure class #1339 fixed at the DERIVED_ACTIONS gate.
function openHandMonkEntry(classEntries: RiderClassEntry[]): RiderClassEntry | undefined {
  const monk = classEntries.find((c) => c.name.toLowerCase() === "monk");
  const slug = monk && resolveSubclassSlug("monk", monk);
  return slug && OPEN_HAND_SLUGS.includes(slug) ? monk : undefined;
}

// Open Hand Technique (Warrior of the Open Hand L3, #1245): the focus save DC
// for the Push/Topple riders, undefined off-subclass or below the gate. Addle
// carries no save, but the shape stays uniform (saveDC is always present once
// unlocked). Gated through hasOpenHandTechnique (#1337: the single source of
// the L3 threshold, also consumed by that module's own cast guard) —
// live-play automation lives in that module too.
function openHandTechniqueRider(
  classEntries: RiderClassEntry[],
  abilityScores: Record<string, number>,
  profBonus: number,
): SaveRider | undefined {
  const monk = openHandMonkEntry(classEntries);
  return monk && hasOpenHandTechnique(monk.level) ? { saveDC: monkSaveDC(abilityScores, profBonus) } : undefined;
}

// Quivering Palm (Warrior of the Open Hand L17, #1245): the focus save DC for
// the Con-save trigger, plus whether vibrations are currently set (the
// activeEffects buff registry's inert QUIVERING_PALM_BUFF_KEY marker — see
// quivering-palm.ts's header for why a buff, not new persisted state). Gated
// through hasQuiveringPalm (#1337: the single source of the L17 threshold,
// also consumed by that module's own cast guard).
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

// Assassinate (2014 Assassin L3+, #1526): presence-only — no dice/DC, so a
// plain `true` rather than the DiceRider/SaveRider `Rider` shapes (riders.ts:
// "availability via presence" is exactly this case with nothing else to
// carry). Shares assassinateEligible with resolve-action.ts's op validation
// — see that function's own header for why it's the ONE gate both sides call.
function assassinateRider(classEntries: RiderClassEntry[], edition: RulesEdition): true | undefined {
  return assassinateEligible(classEntries, edition) ? true : undefined;
}

// Assembles the rider view (#1316): each key spread in only when present.
// Kept as its own function (not inlined in serializeCharacter's return) so
// adding a rider's gate doesn't grow serializeCharacter's own branching.
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
    // Battle Master maneuver save DC, folded into the rider contract (#1316) —
    // structurally the same shape as stunningStrike, just sourced from
    // deriveEntryScopedResources via buildResourcesView. maneuverChoiceCount/
    // toolProfChoiceCount stay in `resources` — they're choice counts,
    // load-bearing for the clamp-on-read in serialize/classes.ts. Named for
    // the feature (`maneuvers`), like every other rider, not the field —
    // `announcedSaveDC` (#1589) is the GENERIC ClassExtras field this rider
    // happens to be the sole consumer of today; a future Cleric/Monk/
    // Barbarian/Rogue rider would read the SAME field under its OWN rider
    // name, never a second `maneuvers`-shaped consumer of it.
    ...(announcedSaveDC !== undefined ? { maneuvers: { saveDC: announcedSaveDC } } : {}),
  };
}

// Wire portraitUrl (#1615), derived at read time from the persisted blob key
// (derive-don't-persist — the key itself never leaves the server). The path is
// RELATIVE, so it stays same-origin in dev (Vite proxies /api) and prod
// (single-origin static mode) and is covered by the CSP's imgSrc 'self' with
// no securityHeaders change. `?v=` is the key's uuid filename segment: a
// re-upload mints a new uuid, so the URL changes per upload, which is what
// lets the GET endpoint serve Cache-Control: immutable. Exposing the uuid
// grants nothing — access is enforced by the route, not by URL secrecy.
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
    portraitUrl: derivePortraitUrl(row),
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

// Attach catalog entitlement metadata (#1798, epic #1795 3/6) to whichever
// spellcasting view buildSpellcastingView produced — every shape it can
// return (caster, granted-only, multiclass, the legacy blob) carries a
// `spells` array under the same key, so this reads/replaces that one field
// generically rather than re-deriving per view shape.
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
  // Reconstructs weaponDetail/armorDetail/consumableDetail/capabilities from
  // `snapshot` (#1649) — every builder below is unchanged from before the
  // mirror tables were dropped, because this is the only place the shape shifts.
  const row = resolveCharacterInventory(rawRow);
  // Derivation order below: later steps read earlier outputs; do not reorder.
  // 1. XP → level + proficiency bonus (derive-don't-persist; docs/leveling.md).
  const progress = experienceProgress(row.experiencePoints);
  const primaryClass = row.classEntries[0];
  const normalizedHitPoints = normalizeHitPoints(row.hitPoints);
  const hitDice = normalizeHitDice(row.hitDice);
  const abilityScoresMap = row.abilityScores as Record<string, number>;

  // 2. Spellcasting + resources views — each clamps stored mutable state to
  //    its level-derived caps (clamp-on-read mirrors of LEVEL_GATED_RECONCILERS).
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
  // Species-granted trait text + improvements (#1682), off the character's
  // OWN species/variant selection (CharacterRace.speciesId/variantId, #1679)
  // — see serialize/species.ts for why this needs no level/edition gating of
  // its own (a species trait row is always active once the species is
  // picked; edition forking already happened at the Species row level).
  const speciesTraits = buildSpeciesTraitsView(row);

  // 3. Advancement clamp → effective scores/HP/initiative, then the feat layer
  //    summed over the kept advancements (origin feats + slot-bounded entries)
  //    TOGETHER WITH active ClassFeature row grants (#1691's classFeatureImprovements)
  //    AND active SpeciesTrait row grants (#1682's speciesTraits.improvements).
  //    conditions (exhaustion) is hoisted above applyFeatLayer — #1321's
  //    effectiveMaxHp composes the feat bonus with exhaustion's PHB'14 p. 291
  //    tier-4 halving, so the feat layer needs the exhaustion level in hand.
  const conditions = normalizeConditionsMutable(row.conditions);
  const { effectiveScores, hitPoints, effectiveInitBonus, clampedAdvancements, advSlotTotal, usedSlots, fightingStyleSlotTotal, usedFightingStyleSlots } =
    applyAdvancementClamp(row, progress.level, normalizedHitPoints);
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

  // 4. Proficiency grants, the per-target modifier channel (active cast buffs
  //    #438 + item passive bonuses #545), and item-granted traits (#529).
  // Pre-compute weapon proficiency grants so they can be reused both in the
  // inventory serialisation (attack-bonus derivation) and the wire response.
  const weaponGrants = buildMergedWeaponProficiencies(row.classEntries, featProficiencies.weapons);
  const activeEffects = normalizeActiveEffectsMutable(row.activeEffects);
  const buffTargets = buildTargetModifiers(row, activeEffects);
  const { itemGrants, itemSkillProfs, itemSaveProfs } = buildItemGrantsView(row);
  // Archery Fighting Style feat (#1137): +2 to ranged attack rolls, summed from
  // the kept advancements' rangedAttackRoll improvements.
  const rangedAttackRollBonus = deriveRangedAttackRollBonus(clampedAdvancements);
  // Bound here rather than inline in the response literal below because the
  // per-inventory-row `proficient` flag has to read exactly the lists rendered
  // beside it (#1433) — passing the un-merged `weaponGrants` would re-warn on an
  // item-granted proficiency the wire array already shows.
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

  // Riders (#1316) — each key present only when the character has it.
  const riders = buildRiderView(
    row.classEntries,
    effectiveScores,
    progress.proficiencyBonus,
    activeEffects,
    announcedSaveDC,
    editionOf(row),
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
    portraitUrl: derivePortraitUrl(row),
    // Shared-campaign link (#246), or undefined when unassigned.
    campaignId: row.campaignId ?? undefined,
    rulesEdition: row.rulesEdition,
    // Served alongside the key (#1436, the #1322 precedent) so the sheet's
    // edition badge stays synchronous — no client copy of the label table, and
    // no /api/editions round-trip just to render a badge.
    rulesEditionLabel: RULES_EDITION_LABELS[editionOf(row)],
    // Campaign-scoped play prefs (#537), or undefined when unattached.
    campaignPreferences: buildCampaignPreferencesView(row),

    armorClass,
    armorClassBreakdown,
    initiativeBonus: effectiveInitBonus + featBonuses.initiative,
    speed,
    // Dragon Wings (#1123) — 2014 only (PHB'14 p.107; the 2024 form is a
    // resource-gated activated ability, withheld — see
    // deriveDragonWingsFlySpeed's header), present only while unarmored at
    // Draconic L14. Absent (never 0) when not flying, same "key present only
    // when the character has it" convention as the riders above.
    flySpeed,
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
    // Armor/weapon proficiencies — derived fully at read time from class,
    // species-trait, and feat grants (species grants arrive feat-sourced since
    // the #1682 RACE_PROFICIENCY_GRANTS retirement). No persistence needed:
    // feat-granted additions are already tracked in advancements. Deduped with
    // precedence class > feat so a feat re-granting an existing class
    // proficiency renders as a single class-sourced entry.
    armorProficiencies: armorGrants,
    weaponProficiencies: itemMergedWeaponGrants,
    inventory,
    currency: row.currency,
    // Encumbrance (#1377): both numbers are derived here so the sheet only
    // formats them. Capacity reads `effectiveScores`, not row.abilityScores —
    // the post-clamp score is what the wire reports as `abilityScores`, and
    // reading the raw column would disagree with it after a STR ASI.
    carryCapacity: carryingCapacity(effectiveScores.strength),
    carriedWeight: carriedWeight(row.inventoryItems, currencyOrEmpty(row.currency)),
    // The 3-item attunement cap as a served number, from the same constant the
    // attune path's 409 rejects on — the sheet used to re-type the literal in
    // four places.
    attunementCap: ATTUNEMENT_LIMIT,
    spellcasting,
    resources,
    // Active status conditions + exhaustion level. Normalized on read (unknown
    // keys dropped, deduped by key, exhaustion clamped 0–6) — mutate via
    // POST /characters/:id/conditions/transactions, never PATCH.
    conditions,
    // Display text for the CURRENT exhaustion level, resolved for this
    // character's edition (#1322) so the sentence can never contradict `speed`
    // or the rollModifiers below — the frontend used to author this text,
    // edition-blind, and printed 2024 text on a 2014 character. NOT folded
    // into `conditions`: that object is also the write shape and the audit
    // before/after payload, and a derived string has no business being persisted.
    exhaustionEffectText: exhaustionEffectText(conditions.exhaustion, editionOf(row)),
    // Active cast-granted passive modifiers (buffs). Normalized on read; each is
    // also summed into its target skill/stat's tempModifier above.
    activeEffects,
    // State-driven advantage/disadvantage grants (#486), derived from active
    // conditions + buffs. The frontend resolves the effective mode per roll.
    rollModifiers: buildRollModifiers(conditions, activeEffects, editionOf(row)),

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

    // Class-specific available actions for the turn tracker (universal ones ride
    // GET /api/reference instead, resolved per edition — #1430).
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
    ),

    // Combat attack rows — derived at read time so the session turn sheets render
    // served numbers instead of recomputing attack math on the client (#1434).
    // unarmedStrike/improvisedWeapon stay on the payload because other surfaces
    // read them; the matching `attackRows` entries are built FROM them.
    unarmedStrike,
    improvisedWeapon,
    attackRows,
    // Weapon attacks per Attack action (Extra Attack), max across multiclass
    // (#1530) — row-driven from each entry's seeded ClassFeature rows,
    // featureRowsOf is the SAME "class"/"subclassRef" -> carrier extractor
    // buildResourcesView/buildAvailableActionsView already use.
    attacksPerAction: deriveAttacksPerAction(row.classEntries, editionOf(row), featureRowsOf),
    // Weapon-attack crit range (#1120): default 20, widened by Champion's
    // Improved/Superior Critical — edition-invariant (SRD 5.1 p.25 / SRD 5.2
    // p.49 agree on level AND threshold), so deriveCritRange itself takes no
    // `edition` parameter; `editionOf(row)` here is only the row filter every
    // derivedStat reader already takes.
    critRange: deriveCritRange(row.classEntries, editionOf(row), featureRowsOf),
    // A two-handed weapon in MAIN_HAND locks OFF_HAND (#1433) — a property of the
    // whole loadout, hence one top-level boolean rather than a per-row flag. NOT
    // the same rule as `offHandBusy` (an internal of buildInventoryContext):
    // that one is true for a shield OR a second weapon and only picks a versatile
    // weapon's die, while this one says nothing may occupy the off-hand at all.
    offHandLocked: isOffHandLocked(row.inventoryItems),
    // Riders (#1316): sneakAttack/stunningStrike/openHandTechnique/
    // quiveringPalm/maneuvers/assassinate, each present only when the
    // character has it.
    ...riders,

    // Species-granted information (#1682): name + cited trait text for the
    // character's own species/variant selection, darkvision (when present)
    // rendered like any other trait — announce-only per owner ruling, not a
    // derived combat stat. [] for a legacy `race`-name-only character (no
    // species picked, #1679's additive migration) — the section itself
    // handles an empty list, never a crash.
    speciesTraits: speciesTraits.traits,

    journal: buildJournalView(row),

    // Multiclass-aware per-class view with the level + subclass clamps-on-read
    // (issues #124/#125) — see buildClassesView.
    classes: buildClassesView(row, progress.level),
  };
}
