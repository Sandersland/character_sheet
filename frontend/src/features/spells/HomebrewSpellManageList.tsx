import HomebrewSpellManageRow from "@/features/spells/HomebrewSpellManageRow";
import type { CatalogSpell } from "@/types/character";

interface HomebrewSpellManageListProps {
  spells: CatalogSpell[];
  busyId: string | null;
  onEdit: (spell: CatalogSpell) => void;
  onDelete: (spell: CatalogSpell) => Promise<void>;
}

export default function HomebrewSpellManageList({ spells, busyId, onEdit, onDelete }: HomebrewSpellManageListProps) {
  if (spells.length === 0) {
    return <p className="py-2 text-center text-xs text-parchment-600">You haven't authored any homebrew spells yet.</p>;
  }

  return (
    <ul className="max-h-[240px] overflow-y-auto">
      {spells.map((spell) => (
        <HomebrewSpellManageRow
          key={spell.id}
          spell={spell}
          busy={busyId === spell.id}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </ul>
  );
}
