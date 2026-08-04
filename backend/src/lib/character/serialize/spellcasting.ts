import {
  abilityModifier,
  deriveSpellcasting,
  deriveMulticlassSpellcasting,
  derivePreparedSpellLimit,
  casterModelForEntries,
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
import { SHADOW_ART_CONCENTRATION_PREFIX } from "@/lib/classes/shadow-arts.js";
import { effectiveEntryLevel } from "@/lib/leveling/effective-levels.js";
import { editionOf } from "@/lib/rules/edition.js";
import type { RulesEdition } from "@character-sheet/shared-types";
import type { CharacterWithRelations } from "@/lib/character/character-include.js";
import type { PrimaryClass } from "./classes.js";

// Merge derived subclass-granted spells after the stored spells, dropping any
// grant whose name matches a stored entry (the player's learned copy wins).
function mergeGrantedSpells(stored: SpellEntry[], granted: SpellEntry[]): SpellEntry[] {
  if (granted.length === 0) return stored;
  const storedNames = new Set(stored.map((s) => s.name.toLowerCase()));
  return [...stored, ...granted.filter((g) => !storedNames.has(g.name.toLowerCase()))];
}

// Subclass-granted spells across every class entry, each gated by its effective
// level (multiclass here → per-entry; single-sourced via effectiveEntryLevel).
function collectGrantedSpells(entries: CharacterWithRelations["classEntries"], derivedLevel: number, edition: RulesEdition): SpellEntry[] {
  return entries.flatMap((e) => deriveGrantedSpells(e.subclassRef, effectiveEntryLevel(e.level, entries.length, derivedLevel), edition));
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
function collectGrantedCastingAbility(entries: CharacterWithRelations["classEntries"], derivedLevel: number, edition: RulesEdition): keyof AbilityScores {
  const granting = entries.find((e) => deriveGrantedSpells(e.subclassRef, effectiveEntryLevel(e.level, entries.length, derivedLevel), edition).length > 0);
  return deriveGrantedCastingAbility(granting?.subclassRef, edition);
}

// #1689: a species-granted spell (High Elf's Cantrip) carries its OWN fixed
// casting ability, independent of any subclass grant — preferred over
// deriveGrantedCastingAbility's subclass-or-Wisdom default whenever the
// character's ONLY spell source a slotless view renders is a species grant
// (e.g. a non-caster High Elf Fighter, which has no subclass to derive from
// and would otherwise default to Wisdom). null when no stored entry carries
// the marker, so callers fall through to the subclass-derived default.
function deriveSpeciesCastingAbility(spells: SpellEntry[]): keyof AbilityScores | null {
  const species = spells.find((s) => s.source === "species" && s.castingAbility);
  return (species?.castingAbility as keyof AbilityScores) ?? null;
}

// Whether a character's STORED spells carry a species grant (#1689) at all —
// split out of buildSingleClassSpellcastingView/buildMulticlassSpellcastingView
// purely to keep each function's own cyclomatic/cognitive complexity under
// the repo's health gate (both need only the boolean, not the entries).
function hasStoredSpeciesGrant(stored: { spells: SpellEntry[] }): boolean {
  return stored.spells.some((s) => s.source === "species");
}

// Whether a non-caster class still gets a slotless spellcasting view: a
// subclass grant, an item grant (#528), or a species grant (#1689, e.g. a
// High Elf Fighter's racial Cantrip). Split out of
// buildSingleClassSpellcastingView purely to keep that function's own
// cyclomatic/cognitive complexity under the repo's health gate.
function hasAnyNonCasterGrant(granted: SpellEntry[], itemSpells: SpellEntry[], row: CharacterWithRelations): boolean {
  return granted.length > 0 || itemSpells.length > 0 || hasStoredSpeciesGrant(normalizeSpellcastingMutable(row.spellcasting));
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

// Non-caster class that nonetheless gets a subclass- or species-granted spell
// (e.g. a Warrior of Shadow monk's Minor Illusion, or a High Elf Fighter's
// racial Cantrip). Slotless view so the grant renders; the casting ability
// prefers a stored species grant's OWN fixed ability (#1689) over the
// subclass-derived default (Wisdom when neither applies).
function buildGrantedOnlySpellcastingView(
  row: CharacterWithRelations,
  primaryClass: PrimaryClass,
  abilityScores: Record<string, number>,
  proficiencyBonus: number,
  granted: SpellEntry[],
  itemSpells: SpellEntry[],
): object {
  const stored = normalizeSpellcastingMutable(row.spellcasting);
  // fallow-ignore-next-line code-duplication -- casting-ability + modifier derivation shared with other spellcasting serializers by design
  const castingAbility = deriveSpeciesCastingAbility(stored.spells) ?? deriveGrantedCastingAbility(primaryClass?.subclassRef, editionOf(row));
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

// The subset of the view needed to enumerate castable slot levels — shared by
// every view builder (single-class caster, multiclass, granted-only).
interface CastableLevelsView {
  ability?: string;
  slots?: { level: number }[];
  arcana?: { level: number }[];
  pact?: { slotLevel: number } | null;
}

// `entries`' levels ≥ minLevel — the shared filter behind the slots/arcana
// arms of castableSlotLevels below.
function levelsAtOrAbove(entries: { level: number }[] | undefined, minLevel: number): number[] {
  return (entries ?? []).map((e) => e.level).filter((level) => level >= minLevel);
}

// Every slot level `spell` can be cast at, keyed by `chosenSlotLevel ?? spell.level`
// (#1381): cantrips resolve once at slotLevel 0 (character-level scaling is
// baked into resolveEffectSpec); a leveled spell adds every level ≥ its own
// from the view's OWN slots/arcana/pact — not availableSlotLevels' `used <
// total` filter, which would empty out (and hide the grimoire preview for) a
// caster who has spent every slot. An item-granted spell also adds its fixed
// castLevel, which can exceed any slot the character owns.
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

// Decorate each spell with its resolved EffectSpec plus one resolved roll per
// castable slot level (#1381) — the rules (cantrip ladder, upcast dice, heal
// ability-modifier) resolve here so the client never re-derives them. A spec
// with no dice (a utility spell) yields effectRolls: [], matching the prior
// client-side computeCastSpec/effectPreview behaviour of returning null.
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
      const roll = resolveEffectSpec(effect, effectiveStep, { characterLevel, abilityMod });
      if (roll) effectRolls.push({ slotLevel, roll });
    }
    return { ...spell, effect, effectRolls };
  });
}

// Spellcasting clamp-on-read: derive stats (ability/DC/attack/slot totals) from
// class+level+scores, then layer the stored mutable state (slotsUsed, spells,
// concentration) clamped to the derived caps. Same derive-don't-persist pattern
// as level/proficiencyBonus. Returns undefined for non-casters.
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
  // Clamp-on-read (#1127): trim any over-cap prepared spells to the derived limit
  // (the reconciler is the write-side; this is the non-destructive read fallback).
  const limit = derivePreparedSpellLimit(limitEntries, abilityScores, edition);
  const raw = (view as { spells?: unknown }).spells;
  const clamped = clampPreparedToLimit(Array.isArray(raw) ? (raw as SpellEntry[]) : [], limit).spells;
  // #1381: `abilityScores` here is the same raw row.abilityScores that
  // deriveSpellcasting already used above to compute spellSaveDC/
  // spellAttackBonus (not serializeCharacter's effectiveScores) — the served
  // heal modifier agrees with the served save DC for an unreconciled over-cap
  // character rather than silently drifting from it.
  const castableView = view as CastableLevelsView;
  const abilityMod = abilityModifier(abilityScores[castableView.ability ?? ""] ?? 10);
  const decorated = decorateSpellEffects(clamped, castableView, level, abilityMod);
  const clampedView = { ...view, spells: decorated };
  // #1507/#1511: whether this character's chosen spells are immediately
  // castable ("known") or must be prepared from a wider list ("prepared") —
  // omitted (not `null`) for a non-caster, matching preparedSpellLimit's own
  // granted-only/non-caster omission shape below.
  const casterModel = casterModelForEntries(limitEntries, edition);
  return {
    ...clampedView,
    ...derivePreparedFields(clampedView, limit),
    ...(casterModel != null ? { casterModel } : {}),
  };
}

// Class entries feeding the prepared-cap sum: single-class uses the XP-derived
// level (the per-class column can be stale); multiclass uses per-entry levels.
function preparedLimitEntries(
  row: CharacterWithRelations,
  primaryClass: PrimaryClass,
  level: number,
): Array<{ name: string; level: number; subclass: string | null }> {
  if (row.classEntries.length === 0) {
    return [{ name: primaryClass?.name ?? "", level, subclass: primaryClass?.subclass ?? null }];
  }
  return row.classEntries.map((e) => ({
    name: e.name,
    level: effectiveEntryLevel(e.level, row.classEntries.length, level),
    subclass: e.subclass,
  }));
}

// Derived prepared-spell cap fields (#883): the limit plus the current count,
// counted from the already-clamped view. source==null excludes granted spells;
// level>0 excludes always-prepared cantrips.
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
    return buildMulticlassSpellcastingView(row, level, abilityScores, proficiencyBonus);
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
    editionOf(row),
  );
  const granted = deriveGrantedSpells(primaryClass?.subclassRef, level, editionOf(row));
  const itemSpells = deriveItemSpellsFor(row); // #528: surfaced for any holder, caster or not.

  if (derivedSpell) {
    return buildCasterSpellcastingView(row, derivedSpell, granted, itemSpells);
  }
  // #1689: a species grant (e.g. a High Elf Fighter's racial Cantrip) is
  // stored, not derived — check it alongside subclass/item grants so a
  // non-caster class still surfaces its ONE spell instead of falling through
  // to buildFallbackSpellcastingBlob (which only renders a legacy `slots`-
  // shaped blob, never the compact stored format).
  if (hasAnyNonCasterGrant(granted, itemSpells, row)) {
    return buildGrantedOnlySpellcastingView(row, primaryClass, abilityScores, proficiencyBonus, granted, itemSpells);
  }
  return buildFallbackSpellcastingBlob(row);
}

// Multiclass spellcasting view: combined slot pool + separate Pact Magic, built
// from every class entry (not just the primary) so a caster in any slot renders.
function buildMulticlassSpellcastingView(
  row: CharacterWithRelations,
  level: number,
  abilityScores: Record<string, number>,
  proficiencyBonus: number,
): object | undefined {
  const multi = deriveMulticlassSpellcasting(
    row.classEntries.map((e) => ({ name: e.name, level: e.level, subclass: e.subclass })),
    abilityScores,
    proficiencyBonus,
    editionOf(row),
  );

  // Subclass-granted spells across every class entry (each gated by its own level).
  const granted = collectGrantedSpells(row.classEntries, level, editionOf(row));
  const itemSpells = deriveItemSpellsFor(row);
  const stored = normalizeSpellcastingMutable(row.spellcasting);

  // No caster class in the mix, but a subclass, item, or species (#1689)
  // grant still supplies a spell — surface a slotless view (ability derived
  // per rule; mirrors the single-class branch).
  if (multi.classes.length === 0) {
    if (granted.length === 0 && itemSpells.length === 0 && !hasStoredSpeciesGrant(stored)) return undefined;
    const castingAbility = deriveSpeciesCastingAbility(stored.spells) ?? collectGrantedCastingAbility(row.classEntries, level, editionOf(row));
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
