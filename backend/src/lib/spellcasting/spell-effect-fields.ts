// The 9 structured-effect columns nullable on Spell, describing a spell's
// auto-rollable mechanics (damage/heal/buff dice + save) — named ONCE here
// so every catalog-adjacent site that reads or writes them shares one list
// (#1815 review finding 5: this was a third independent copy, spread across
// spells.ts/custom-spells.ts/fork.ts, and a future column added to only one
// of the three would silently serve `null` there where the wire type
// promises `undefined`). A loop over one list, not nine hand-written `??`
// sites per site — the complexity/CRAP ceiling every one of those files hit
// before its own extraction, per their own now-superseded comments.
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
] as const satisfies readonly (keyof CustomSpellInput & keyof Spell)[];

export type SpellEffectFieldName = (typeof SPELL_EFFECT_FIELD_NAMES)[number];
export type NullableSpellEffectFields = Pick<Spell, SpellEffectFieldName>;
export type UndefinedSpellEffectFields = { [K in SpellEffectFieldName]: Spell[K] | undefined };

/** Write direction (custom-spells.ts only): a parsed request body's effect fields, defaulted to `null` for a Prisma write. */
export function nullableSpellEffectFields(data: CustomSpellInput): NullableSpellEffectFields {
  const out = {} as Record<SpellEffectFieldName, unknown>;
  for (const name of SPELL_EFFECT_FIELD_NAMES) {
    out[name] = data[name] ?? null;
  }
  // TS can't narrow a Record write keyed by a union loop variable back to the
  // per-field union NullableSpellEffectFields declares — every value above
  // came straight from CustomSpellInput's own typed fields (or null), so
  // this is the single controlled cast back to that shape, not an escape
  // hatch.
  return out as NullableSpellEffectFields;
}

/** Read/serialize direction (spells.ts, custom-spells.ts, fork.ts): a Spell row's nullable effect columns, defaulted to `undefined` for the wire. */
export function undefinedSpellEffectFields(row: Spell): UndefinedSpellEffectFields {
  const out = {} as Record<SpellEffectFieldName, unknown>;
  for (const name of SPELL_EFFECT_FIELD_NAMES) {
    out[name] = row[name] ?? undefined;
  }
  // Same cast rationale as nullableSpellEffectFields above.
  return out as UndefinedSpellEffectFields;
}
