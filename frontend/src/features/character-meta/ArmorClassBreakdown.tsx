import { useCurrentCharacter } from "@/hooks/CurrentCharacterProvider";
import { formatModifier } from "@/lib/abilities";

/**
 * Shared by `BannerVitals` and `MobileSheetHeader` so the AC breakdown
 * renders identically in both.
 */
export default function ArmorClassBreakdown() {
  const { character } = useCurrentCharacter();
  return (
    <dl className="px-3 py-2 text-sm">
      {character.armorClassBreakdown.map((part, i) => (
        <div key={`${part.label}-${i}`} className="flex items-center justify-between gap-4 py-0.5">
          <dt className="text-parchment-700">{part.label}</dt>
          <dd className="font-semibold tabular-nums text-parchment-900">
            {/* deriveArmorClassParts always emits the base (armor/unarmored) part first. */}
            {i === 0 ? part.value : formatModifier(part.value)}
          </dd>
        </div>
      ))}
      <div className="mt-1 flex items-center justify-between gap-4 border-t border-parchment-200 pt-1">
        <dt className="font-semibold text-parchment-800">Total</dt>
        <dd className="font-semibold tabular-nums text-parchment-900">{character.armorClass}</dd>
      </div>
    </dl>
  );
}
