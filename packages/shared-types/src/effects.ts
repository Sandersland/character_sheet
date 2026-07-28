// Canonical 5e effect model (dice + save + scaling) wire type (#1272), single-
// sourced here; backend/src/lib/combat/effects.ts is the only implementation
// of the runtime resolution (readEffectSpec/resolveEffectSpec) — the former
// frontend/src/lib/effects.ts mirror is deleted (#1381). Extracted from Spell
// so it can describe any activated ability, not just spells.

// Kind of thing an effect does. "utility" carries no roll today; "buff" applies
// a passive stat modifier (no roll) while the granting concentration holds.
export type EffectType = "damage" | "heal" | "utility" | "buff";

// How the dice count grows: cantrips scale by character level, leveled spells by
// slot upcast steps.
export interface EffectScaling {
  mode: "none" | "slotUpcast" | "cantripLevel";
  dicePerStep?: number;
}

// Structured effect describing an activated ability's roll.
export interface EffectSpec {
  effectType: EffectType;
  dice?: { count: number; faces: number; modifier?: number };
  damageType?: string | null;
  attackType?: string | null;
  saveAbility?: string | null;
  saveEffect?: string | null;
  scaling: EffectScaling;
  concentration?: boolean;
  addAbilityModToHeal?: boolean;
  // Passive-modifier ("buff") payload — the skill/stat target and flat modifier
  // applied while the granting concentration holds. Present only for effectType "buff".
  buffTarget?: string | null;
  buffModifier?: number | null;
}

// The 10 flat effect columns snapshotted from the catalog, shared by every
// snapshot shape (SpellEntry, custom-spell input, frontend Spell).
export interface EffectColumns {
  effectKind?: string | null;
  effectDiceCount?: number | null;
  effectDiceFaces?: number | null;
  // Class-die reference (e.g. "superiorityDice") — supersedes effectDiceFaces
  // when it resolves. Backend-only resolution (a ClassDieResolver reads it via
  // resolveEffectDieFaces); kept in the wire type because it's a real catalog
  // column that appears in backend snapshots (ManeuverEntry, pre-resolution).
  // The frontend never sees this column: deriveManeuverEffect resolves it
  // server-side, and the RESOLVED EffectSpec (dice.faces already a number) is
  // what crosses the wire on the maneuver row (#1381).
  effectDieSource?: string | null;
  effectModifier?: number | null;
  damageType?: string | null;
  attackType?: string | null;
  saveAbility?: string | null;
  saveEffect?: string | null;
  upcastDicePerLevel?: number | null;
  cantripScaling?: boolean;
  buffTarget?: string | null;
  buffModifier?: number | null;
}

// A row carrying effect columns plus the level that decides the scaling axis.
export type EffectRow = EffectColumns & { level: number; concentration?: boolean };

// A resolved roll at one castable slot level (#1381). A single resolved roll
// can't work: the picker, the cast sheet, and the grimoire preview all key off
// the slot level the player is CURRENTLY selecting, so the server enumerates
// every level a spell can be cast at (chosenSlotLevel ?? spell.level, plus any
// higher slot/arcanum/pact level) and resolves one roll per entry.
export interface EffectRoll {
  slotLevel: number;
  roll: { count: number; faces: number; modifier: number };
}
