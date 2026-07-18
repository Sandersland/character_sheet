import { formatModifier } from "@/lib/abilities";
import type { Character } from "@/types/character";

/**
 * The Armor Class breakdown `<dl>` shown inside the AC disclosure popover —
 * shared by the desktop banner (`BannerVitals`) and the mobile mini-header
 * (`MobileSheetHeader`) so the labeled parts + total render identically in both.
 */
export default function ArmorClassBreakdown({ character }: { character: Character }) {
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
