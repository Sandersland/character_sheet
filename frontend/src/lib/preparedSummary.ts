// Prepared X / Y summary for the spellcasting block — null for classes that
// have no prepare mechanic (limit is null exactly for known casters, #883).
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
