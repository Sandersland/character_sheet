import {
  abilityModifier,
  deriveSpellcasting,
  deriveMulticlassSpellcasting,
  derivePreparedSpellLimit,
} from "@/lib/srd/srd.js";
import { normalizeSpellcastingMutable } from "@/lib/spellcasting/spellcasting.js";
import type { SpellEntry } from "@/lib/spellcasting/spell-state.js";
import {
  deriveGrantedSpells,
  deriveGrantedCastingAbility,
  deriveItemSpells,
  type AbilityScores,
} from "@/lib/spellcasting/granted-spells.js";
import { SHADOW_ART_CONCENTRATION_PREFIX } from "@/lib/classes/shadow-arts.js";
import type { CharacterWithRelations } from "@/lib/character/character-include.js";
import type { PrimaryClass } from "./classes.js";

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
export function buildSpellcastingView(
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
