import {
  abilityModifier,
  deriveSpellcasting,
  deriveMulticlassSpellcasting,
  derivePreparedSpellLimit,
  casterModelForEntries,
  CASTER_MODEL_LABELS,
  type SubclassCasterRef,
} from "@/lib/srd/srd.js";
import { normalizeSpellcastingMutable } from "@/lib/spellcasting/spellcasting.js";
import { clampPreparedToLimit, type SpellEntry } from "@/lib/spellcasting/spell-state.js";
import {
  deriveGrantedSpells,
  deriveGrantedCastingAbility,
  deriveItemSpells,
  type AbilityScores,
} from "@/lib/spellcasting/granted-spells.js";
import { readEffectSpec, resolveEffectSpec, type EffectRoll } from "@/lib/combat/effects.js";
import { deriveSpellCastCost } from "@/lib/spellcasting/cast-cost.js";
import { SHADOW_ART_CONCENTRATION_PREFIX } from "@/lib/classes/shadow-arts.js";
import { effectiveEntryLevel } from "@/lib/leveling/effective-levels.js";
import { editionOf } from "@/lib/rules/edition.js";
import { buildSpeciesGrantedSpellSourceFor } from "./species.js";
import type { RulesEdition } from "@character-sheet/shared-types";
import type { CharacterWithRelations } from "@/lib/character/character-include.js";
import type { PrimaryClass } from "./classes.js";

// Dropping any grant whose name matches a stored entry — the player's learned copy wins.
function mergeGrantedSpells(stored: SpellEntry[], granted: SpellEntry[]): SpellEntry[] {
  if (granted.length === 0) return stored;
  const storedNames = new Set(stored.map((s) => s.name.toLowerCase()));
  return [...stored, ...granted.filter((g) => !storedNames.has(g.name.toLowerCase()))];
}

function collectGrantedSpells(entries: CharacterWithRelations["classEntries"], derivedLevel: number, edition: RulesEdition): SpellEntry[] {
  return entries.flatMap((e) => deriveGrantedSpells(e.subclassRef, effectiveEntryLevel(e.level, entries.length, derivedLevel), edition));
}

// Independent of class entries — a species pick gates on the character's overall XP-derived level, not a class entry's own level.
// Resolved through the SAME deriveGrantedSpells subclass grants use (sourceKind: "species") — the one-shared-function non-negotiable, not a second derivation path.
// DERIVED, never persisted — distinct from the #1689 species-CHOICE grant (stored, player-picked at creation): this function's output never appears in stored.spells, so the two never collide despite sharing source: "species".
function deriveSpeciesGrantedSpells(row: CharacterWithRelations, level: number, edition: RulesEdition): SpellEntry[] {
  return deriveGrantedSpells(buildSpeciesGrantedSpellSourceFor(row), level, edition, "species");
}

// item: ids are a disjoint space, so no name dedup against learned/subclass spells is needed (#528).
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

function collectGrantedCastingAbility(entries: CharacterWithRelations["classEntries"], derivedLevel: number, edition: RulesEdition): keyof AbilityScores {
  const granting = entries.find((e) => deriveGrantedSpells(e.subclassRef, effectiveEntryLevel(e.level, entries.length, derivedLevel), edition).length > 0);
  return deriveGrantedCastingAbility(granting?.subclassRef, edition);
}

// Returns null when no stored entry carries the marker, so callers fall through to the next tier (resolveGrantedCastingAbility below).
// Never matches a derived species/lineage grant (#1683) — deriveSpeciesGrantedSpells' output is never in stored.spells, and those entries carry no castingAbility field at all.
function deriveSpeciesCastingAbility(spells: SpellEntry[]): keyof AbilityScores | null {
  const species = spells.find((s) => s.source === "species" && s.castingAbility);
  return (species?.castingAbility as keyof AbilityScores) ?? null;
}

// Only ever true for a #1689 species-CHOICE grant — a #1683 derived species/lineage grant is never persisted into stored.spells.
function hasStoredSpeciesGrant(stored: { spells: SpellEntry[] }): boolean {
  return stored.spells.some((s) => s.source === "species");
}

// Priority: subclass grant (if active at this level) wins, then a derived species/lineage grant (#1683), then a stored species-CHOICE grant's own fixed ability (#1689), then Wisdom.
// A character with grants from multiple sources at once is a rare edge case; the DC/attack-bonus model is one scalar per view, so this picks a winner rather than modeling several.
// subclassAbility is a thunk, not a value, so the single-class and multiclass callers can each supply their own resolution without this function caring which.
function resolveGrantedCastingAbility(
  subclassGranted: SpellEntry[],
  subclassAbility: () => keyof AbilityScores,
  speciesGranted: SpellEntry[],
  speciesSource: Parameters<typeof deriveGrantedCastingAbility>[0],
  storedSpells: SpellEntry[],
  edition: RulesEdition,
): keyof AbilityScores {
  if (subclassGranted.length > 0) return subclassAbility();
  if (speciesGranted.length > 0) return deriveGrantedCastingAbility(speciesSource, edition);
  return deriveSpeciesCastingAbility(storedSpells) ?? "wisdom";
}

// Clamp-on-read: surfaces the stored entry when it's a current spellbook spell OR a Shadow Art (entryId carries the shadow-art: prefix, a disjoint id space); drops stale entries otherwise.
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
      // Clamp used to total in case stored value is stale (e.g. after a class change or long rest that wasn't captured in the old blob).
      used: Math.min(total, stored.slotsUsed[String(slotLevel)] ?? 0),
    })),
    // Warlock Mystic Arcanum charges (empty for every other caster). Same clamp-on-read as slots.
    arcana: derivedSpell.arcana.map(({ level: arcanumLevel, total }) => ({
      level: arcanumLevel,
      total,
      used: Math.min(total, stored.arcanumUsed[String(arcanumLevel)] ?? 0),
    })),
    spells,
    concentratingOn: resolveConcentration(stored.concentratingOn, spells),
  };
}

// A non-caster class that still gets a subclass/species-lineage/species-choice-granted spell (e.g. a Warrior of Shadow monk, a Drow-lineage Fighter) gets this slotless view instead; castingAbility is resolved by the caller (resolveGrantedCastingAbility above).
function buildGrantedOnlySpellcastingView(
  row: CharacterWithRelations,
  abilityScores: Record<string, number>,
  proficiencyBonus: number,
  granted: SpellEntry[],
  itemSpells: SpellEntry[],
  castingAbility: keyof AbilityScores,
): object {
  const stored = normalizeSpellcastingMutable(row.spellcasting);
  const abilMod = abilityModifier(abilityScores[castingAbility] ?? 10);
  const grantedSpells = [...mergeGrantedSpells(stored.spells, granted), ...itemSpells];
  return {
    ability: castingAbility,
    spellSaveDC: 8 + proficiencyBonus + abilMod,
    spellAttackBonus: proficiencyBonus + abilMod,
    slots: [],
    arcana: [],
    spells: grantedSpells,
    // A cast concentration Shadow Art surfaces here so the ShadowArtsSection handoff banner + concentrating badge can render.
    concentratingOn: resolveConcentration(stored.concentratingOn, grantedSpells),
  };
}

// The compact mutable format ({ slotsUsed, spells }) is NOT renderable — leave spellcasting undefined so SpellsSection is skipped rather than crashing on slots.filter of undefined.
// Currently inert for real data, but guards future half/third-caster additions.
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

// Shared by every view builder (single-class caster, multiclass, granted-only).
interface CastableLevelsView {
  ability?: string;
  slots?: { level: number }[];
  arcana?: { level: number }[];
  pact?: { slotLevel: number } | null;
}

function levelsAtOrAbove(entries: { level: number }[] | undefined, minLevel: number): number[] {
  return (entries ?? []).map((e) => e.level).filter((level) => level >= minLevel);
}

// Keyed by chosenSlotLevel ?? spell.level (#1381): cantrips resolve once at slotLevel 0; a leveled spell adds every level ≥ its own from the view's OWN slots/arcana/pact.
// Deliberately NOT availableSlotLevels' used < total filter, which would empty out (and hide the grimoire preview for) a caster who has spent every slot.
// An item-granted spell also adds its fixed castLevel, which can exceed any slot the character owns.
function castableSlotLevels(spell: SpellEntry, view: CastableLevelsView): number[] {
  if (spell.level === 0) return [0];
  const levels = new Set<number>([
    spell.level,
    ...levelsAtOrAbove(view.slots, spell.level),
    ...levelsAtOrAbove(view.arcana, spell.level),
  ]);
  if (spell.item) levels.add(spell.item.castLevel);
  if (view.pact && view.pact.slotLevel >= spell.level) levels.add(view.pact.slotLevel);
  return [...levels].sort((a, b) => a - b);
}

// Resolves cantrip ladder / upcast dice / heal ability-modifier here so the client never re-derives them; a spec with no dice (a utility spell) yields effectRolls: [].
// castCost (#1828): deriveSpellCastCost classifies the raw castingTime text server-side so cost.kind is a served enum, never a client-side parse.
function decorateSpellEffects(
  spells: SpellEntry[],
  view: CastableLevelsView,
  characterLevel: number,
  abilityMod: number,
): SpellEntry[] {
  return spells.map((spell) => {
    const effect = readEffectSpec(spell);
    const effectRolls: EffectRoll[] = [];
    for (const slotLevel of castableSlotLevels(spell, view)) {
      const effectiveStep = spell.level === 0 ? 0 : Math.max(0, slotLevel - spell.level);
      const resolved = resolveEffectSpec(effect, effectiveStep, { characterLevel, abilityMod });
      if (resolved) {
        const { instanceCount, ...roll } = resolved;
        effectRolls.push({
          slotLevel,
          roll,
          // instanceRoll rides the spec, not the resolved roll — the granularity ruling never scales.
          ...(instanceCount !== undefined ? { instanceCount, instanceRoll: effect.instances?.roll ?? "each" } : {}),
        });
      }
    }
    const castCost = deriveSpellCastCost(spell.castingTime);
    return { ...spell, effect, effectRolls, castCost };
  });
}

// Clamp-on-read: derives stats from class+level+scores, then layers stored mutable state clamped to the derived caps — same derive-don't-persist pattern as level/proficiencyBonus. Returns undefined for non-casters.
export function buildSpellcastingView(
  row: CharacterWithRelations,
  primaryClass: PrimaryClass,
  level: number,
  abilityScores: Record<string, number>,
  proficiencyBonus: number,
): object | undefined {
  const view = buildSpellcastingViewBase(row, primaryClass, level, abilityScores, proficiencyBonus);
  if (view === undefined) return undefined;
  const edition = editionOf(row);
  const limitEntries = preparedLimitEntries(row, primaryClass, level);
  // Clamp-on-read (#1127): the reconciler is the write-side; this is the non-destructive read fallback.
  const limit = derivePreparedSpellLimit(limitEntries, abilityScores, edition);
  const raw = (view as { spells?: unknown }).spells;
  const clamped = clampPreparedToLimit(Array.isArray(raw) ? (raw as SpellEntry[]) : [], limit).spells;
  // abilityScores here is the same raw row.abilityScores deriveSpellcasting already used for spellSaveDC/spellAttackBonus (not effectiveScores) — keeps the served heal modifier from drifting from the served save DC for an unreconciled over-cap character (#1381).
  const castableView = view as CastableLevelsView;
  const abilityMod = abilityModifier(abilityScores[castableView.ability ?? ""] ?? 10);
  const decorated = decorateSpellEffects(clamped, castableView, level, abilityMod);
  const clampedView = { ...view, spells: decorated };
  // Whether spells are immediately castable ("known") or must be prepared from a wider list ("prepared") — omitted (not null) for a non-caster (#1507/#1511).
  const casterModel = casterModelForEntries(limitEntries, edition);
  // The meter/roster noun and the locked-rune tooltip word, served alongside casterModel so the grimoire never composes "known"-vs-"prepared" copy itself (#1511 D4).
  const labels = casterModel != null ? CASTER_MODEL_LABELS[casterModel] : null;
  return {
    ...clampedView,
    ...derivePreparedFields(clampedView, limit),
    ...(casterModel != null ? { casterModel } : {}),
    ...(labels != null ? labels : {}),
  };
}

// Single-class uses the XP-derived level (the per-class column can be stale); multiclass uses per-entry levels.
function preparedLimitEntries(
  row: CharacterWithRelations,
  primaryClass: PrimaryClass,
  level: number,
): Array<{ name: string; level: number; subclassRef: SubclassCasterRef | null }> {
  if (row.classEntries.length === 0) {
    return [{ name: primaryClass?.name ?? "", level, subclassRef: primaryClass?.subclassRef ?? null }];
  }
  return row.classEntries.map((e) => ({
    name: e.name,
    level: effectiveEntryLevel(e.level, row.classEntries.length, level),
    subclassRef: e.subclassRef,
  }));
}

// source==null excludes granted spells; level>0 excludes always-prepared cantrips.
function derivePreparedFields(
  view: object,
  limit: number | null,
): { preparedSpellLimit: number | null; preparedSpellCount: number } {
  const raw = (view as { spells?: unknown }).spells;
  const spells: SpellEntry[] = Array.isArray(raw) ? raw : [];
  return {
    preparedSpellLimit: limit,
    preparedSpellCount: spells.filter((s) => s.prepared && s.level > 0 && s.source == null).length,
  };
}

// Multiclass (2+ entries) merges caster levels into one slot pool + separate Pact Magic (#123); single-class
// output stays byte-for-byte identical.
function buildSpellcastingViewBase(
  row: CharacterWithRelations,
  primaryClass: PrimaryClass,
  level: number,
  abilityScores: Record<string, number>,
  proficiencyBonus: number,
): object | undefined {
  if (row.classEntries.length > 1) {
    return buildMulticlassSpellcastingView(row, level, abilityScores, proficiencyBonus);
  }
  return buildSingleClassSpellcastingView(row, primaryClass, level, abilityScores, proficiencyBonus);
}

// Species/lineage grants ride alongside subclass grants everywhere — a caster's own class ability governs effect rolls uniformly either way; only the granted-only branch needs to pick WHICH source's ability to use (resolveGrantedCastingAbility).
function collectSingleClassGranted(
  row: CharacterWithRelations,
  primaryClass: PrimaryClass,
  level: number,
  edition: RulesEdition,
): { subclassGranted: SpellEntry[]; speciesGranted: SpellEntry[]; granted: SpellEntry[] } {
  const subclassGranted = deriveGrantedSpells(primaryClass?.subclassRef, level, edition);
  const speciesGranted = deriveSpeciesGrantedSpells(row, level, edition);
  return { subclassGranted, speciesGranted, granted: [...subclassGranted, ...speciesGranted] };
}

function buildSingleClassGrantedOnlyView(
  row: CharacterWithRelations,
  primaryClass: PrimaryClass,
  abilityScores: Record<string, number>,
  proficiencyBonus: number,
  subclassGranted: SpellEntry[],
  speciesGranted: SpellEntry[],
  granted: SpellEntry[],
  itemSpells: SpellEntry[],
  stored: ReturnType<typeof normalizeSpellcastingMutable>,
  edition: RulesEdition,
): object {
  const castingAbility = resolveGrantedCastingAbility(
    subclassGranted,
    () => deriveGrantedCastingAbility(primaryClass?.subclassRef, edition),
    speciesGranted,
    buildSpeciesGrantedSpellSourceFor(row),
    stored.spells,
    edition,
  );
  return buildGrantedOnlySpellcastingView(row, abilityScores, proficiencyBonus, granted, itemSpells, castingAbility);
}

// Uses the XP-derived level (the per-class column can be stale).
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
    primaryClass?.subclassRef,
    editionOf(row),
  );
  const edition = editionOf(row);
  const { subclassGranted, speciesGranted, granted } = collectSingleClassGranted(row, primaryClass, level, edition);
  const itemSpells = deriveItemSpellsFor(row); // #528: surfaced for any holder, caster or not.

  if (derivedSpell) {
    return buildCasterSpellcastingView(row, derivedSpell, granted, itemSpells);
  }
  const stored = normalizeSpellcastingMutable(row.spellcasting);
  // A species-CHOICE grant (#1689) is stored, not derived — check it alongside subclass/species-lineage/item grants so a non-caster class still surfaces its ONE spell instead of falling through to buildFallbackSpellcastingBlob (which only renders a legacy slots-shaped blob, never the compact stored format).
  if (granted.length > 0 || itemSpells.length > 0 || hasStoredSpeciesGrant(stored)) {
    return buildSingleClassGrantedOnlyView(row, primaryClass, abilityScores, proficiencyBonus, subclassGranted, speciesGranted, granted, itemSpells, stored, edition);
  }
  return buildFallbackSpellcastingBlob(row);
}

// Built from every class entry (not just the primary) so a caster in any slot renders.
function buildMulticlassSpellcastingView(
  row: CharacterWithRelations,
  level: number,
  abilityScores: Record<string, number>,
  proficiencyBonus: number,
): object | undefined {
  const multi = deriveMulticlassSpellcasting(
    row.classEntries.map((e) => ({ name: e.name, level: e.level, subclass: e.subclass, subclassRef: e.subclassRef })),
    abilityScores,
    proficiencyBonus,
    editionOf(row),
  );

  const edition = editionOf(row);
  const subclassGranted = collectGrantedSpells(row.classEntries, level, edition);
  const speciesGranted = deriveSpeciesGrantedSpells(row, level, edition);
  const granted = [...subclassGranted, ...speciesGranted];
  const itemSpells = deriveItemSpellsFor(row);
  const stored = normalizeSpellcastingMutable(row.spellcasting);

  // No caster class in the mix, but a subclass/species-lineage/species-choice/item grant still supplies a spell — reuses the SAME buildGrantedOnlySpellcastingView shape as the single-class case.
  if (multi.classes.length === 0) {
    if (granted.length === 0 && itemSpells.length === 0 && !hasStoredSpeciesGrant(stored)) return undefined;
    const castingAbility = resolveGrantedCastingAbility(
      subclassGranted,
      () => collectGrantedCastingAbility(row.classEntries, level, edition),
      speciesGranted,
      buildSpeciesGrantedSpellSourceFor(row),
      stored.spells,
      edition,
    );
    return buildGrantedOnlySpellcastingView(row, abilityScores, proficiencyBonus, granted, itemSpells, castingAbility);
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
    // Warlock Pact Magic, kept out of the merged pool (PHB p. 164). Null for a multiclass character with no warlock levels.
    pact: multi.pact
      ? {
          slotLevel: multi.pact.slotLevel,
          count: multi.pact.count,
          used: Math.min(multi.pact.count, stored.slotsUsed[String(multi.pact.slotLevel)] ?? 0),
          spellSaveDC: multi.pact.spellSaveDC,
          spellAttackBonus: multi.pact.spellAttackBonus,
        }
      : null,
    classes: multi.classes,
    spells: mergedSpells,
    concentratingOn: resolveConcentration(stored.concentratingOn, mergedSpells),
  };
}
