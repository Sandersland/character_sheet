// Prepared X / Y summary for the spellcasting block — null only for non-casters
// (2024: every caster has a prepared cap, so limit is null only when uncapped, #883).
import type { Character } from "@/types/character";

type Spellcasting = NonNullable<Character["spellcasting"]>;

export interface PreparedSummary {
  count: number;
  limit: number | null;
}

export function derivePreparedSummary(sc: Spellcasting): PreparedSummary | null {
  const limit = sc.preparedSpellLimit ?? null;
  if (limit == null) return null;
  const count =
    sc.preparedSpellCount ?? (sc.spells ?? []).filter((s) => s.level > 0 && s.prepared).length;
  return { count, limit };
}
