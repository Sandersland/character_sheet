// Named once here so every catalog-adjacent site that reads/writes these fields shares one list — a future column added to only one copy would silently serve null where the wire type promises undefined (#1815).
import type { CustomSpellInput } from "@character-sheet/contracts";

import type { Spell } from "@/generated/prisma/client.js";

const SPELL_EFFECT_FIELD_NAMES = [
  "effectKind",
  "effectDiceCount",
  "effectDiceFaces",
  "effectModifier",
  "damageType",
  "attackType",
  "saveAbility",
  "saveEffect",
  "upcastDicePerLevel",
  // Multi-instance columns (#1981/#1984) — see shared-types' EffectColumns for the mechanic.
  "instanceCount",
  "instanceRoll",
  "upcastInstancesPerLevel",
] as const satisfies readonly (keyof CustomSpellInput & keyof Spell)[];

export type SpellEffectFieldName = (typeof SPELL_EFFECT_FIELD_NAMES)[number];
export type NullableSpellEffectFields = Pick<Spell, SpellEffectFieldName>;
export type UndefinedSpellEffectFields = { [K in SpellEffectFieldName]: Spell[K] | undefined };

// Write direction: a parsed request body's effect fields, defaulted to `null` for a Prisma write.
export function nullableSpellEffectFields(data: CustomSpellInput): NullableSpellEffectFields {
  const out = {} as Record<SpellEffectFieldName, unknown>;
  for (const name of SPELL_EFFECT_FIELD_NAMES) {
    out[name] = data[name] ?? null;
  }
  // TS can't narrow this Record write back to the per-field union — every value came straight from CustomSpellInput's typed fields (or null), so this cast is safe, not an escape hatch.
  return out as NullableSpellEffectFields;
}

// Read/serialize direction: a Spell row's nullable effect columns, defaulted to `undefined` for the wire.
export function undefinedSpellEffectFields(row: Spell): UndefinedSpellEffectFields {
  const out = {} as Record<SpellEffectFieldName, unknown>;
  for (const name of SPELL_EFFECT_FIELD_NAMES) {
    out[name] = row[name] ?? undefined;
  }
  return out as UndefinedSpellEffectFields;
}
