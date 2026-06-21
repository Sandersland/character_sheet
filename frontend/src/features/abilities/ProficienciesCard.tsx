/**
 * ProficienciesCard — read-only display of a character's weapon and armor
 * proficiencies, grouped by type. Proficiencies are derived server-side at
 * read time from class, race, and feat grants (no mutable state here).
 *
 * Source tags ("Class", "Race", "Feat") indicate which grant conferred the
 * proficiency when multiple sources could apply — class beats race beats feat.
 */

import type { ArmorProficiency, Character, WeaponProficiency } from "@/types/character";
import { ARMOR_CATEGORY_LABELS, ARMOR_CATEGORY_ORDER } from "@/lib/abilities";

interface Props {
  character: Character;
}

const SOURCE_LABELS: Record<ArmorProficiency["source"] | WeaponProficiency["source"], string> = {
  class: "Class",
  race:  "Race",
  feat:  "Feat",
};

/** Sort armor proficiencies in canonical display order (light → medium → heavy → shield). */
function sortedArmor(profs: ArmorProficiency[]): ArmorProficiency[] {
  return [...profs].sort(
    (a, b) =>
      ARMOR_CATEGORY_ORDER.indexOf(a.category) - ARMOR_CATEGORY_ORDER.indexOf(b.category),
  );
}

function ProficiencyRow({ label, source }: { label: string; source: "class" | "race" | "feat" }) {
  return (
    <tr className="border-t border-parchment-200">
      {/* Proficiency dot */}
      <td className="w-6 py-1.5 pl-4">
        <span className="block h-2 w-2 rounded-full bg-garnet-500" aria-hidden="true" />
      </td>
      {/* Name */}
      <td className="py-1.5 font-medium text-parchment-900">{label}</td>
      {/* Source tag */}
      <td className="py-1.5 pr-4 text-right text-xs text-parchment-400">
        {SOURCE_LABELS[source]}
      </td>
    </tr>
  );
}

export default function ProficienciesCard({ character }: Props) {
  const armor = sortedArmor(character.armorProficiencies ?? []);
  const weapons = character.weaponProficiencies ?? [];

  if (armor.length === 0 && weapons.length === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      {weapons.length > 0 && (
        <div>
          <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-parchment-500">
            Weapons
          </h4>
          <table className="w-full table-fixed border-collapse text-sm">
            <caption className="sr-only">Weapon proficiencies</caption>
            <thead className="sr-only">
              <tr>
                <th scope="col">Proficient</th>
                <th scope="col">Weapon</th>
                <th scope="col">Source</th>
              </tr>
            </thead>
            <tbody>
              {weapons.map((p) => (
                <ProficiencyRow key={p.name} label={p.name} source={p.source} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {armor.length > 0 && (
        <div>
          <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-parchment-500">
            Armor
          </h4>
          <table className="w-full table-fixed border-collapse text-sm">
            <caption className="sr-only">Armor proficiencies</caption>
            <thead className="sr-only">
              <tr>
                <th scope="col">Proficient</th>
                <th scope="col">Armor type</th>
                <th scope="col">Source</th>
              </tr>
            </thead>
            <tbody>
              {armor.map((p) => (
                <ProficiencyRow
                  key={p.category}
                  label={ARMOR_CATEGORY_LABELS[p.category]}
                  source={p.source}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
