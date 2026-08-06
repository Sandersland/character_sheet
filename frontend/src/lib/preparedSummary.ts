// Prepared X / Y summary for the spellcasting block (#883). limit is null only
// for a non-caster — a 2014 known caster's Spells Known number is a non-null
// limit exactly like a 2024 prepared caster's (#1507); casterModel is what
// distinguishes the two mechanics, not this null check (#1511 D2).
import type { Character } from "@/types/character";

type Spellcasting = NonNullable<Character["spellcasting"]>;

export interface PreparedSummary {
  count: number;
  limit: number | null;
  /** Served meter noun (#1511 D4), e.g. "Prepared" / "Spells known". */
  label: string;
}

export function derivePreparedSummary(sc: Spellcasting): PreparedSummary | null {
  const limit = sc.preparedSpellLimit ?? null;
  if (limit == null) return null;
  const count =
    sc.preparedSpellCount ?? (sc.spells ?? []).filter((s) => s.level > 0 && s.prepared).length;
  return { count, limit, label: sc.preparedLabel ?? "Prepared" };
}
