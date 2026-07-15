import { formatModifier } from "@/lib/abilities";
import Popover from "@/components/ui/Popover";
import RollButton from "@/features/dice/RollButton";
import type { Character } from "@/types/character";

/**
 * Always-on vitals chips for the sheet banner — AC / Initiative / Speed / HP.
 *
 * These are the only combat numbers that stay visible across every tab. Styled
 * for the garnet banner (translucent-white chips, light text). AC keeps its
 * labeled breakdown popover and Initiative stays rollable, exactly as they were
 * in the old parchment vitals strip; HP is a read-only readout here (the Combat
 * tab's HitPointTracker remains the single editing surface).
 */
const CHIP =
  "flex min-w-[68px] flex-col items-center justify-center rounded-control border border-white/25 bg-white/10 px-4 py-2";
const VALUE = "font-display text-xl font-semibold leading-none text-parchment-50";
const LABEL = "mt-1 text-[10px] font-semibold uppercase tracking-wide text-garnet-100";

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className={CHIP}>
      <span className={VALUE}>{value}</span>
      <span className={LABEL}>{label}</span>
    </div>
  );
}

export default function BannerVitals({ character }: { character: Character }) {
  const { current, max, temp } = character.hitPoints;

  return (
    <div className="flex flex-wrap gap-2">
      {/* AC — read-only; click discloses the labeled breakdown. */}
      <Popover
        label="Armor Class breakdown"
        triggerClassName={`${CHIP} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50`}
        trigger={
          <>
            <span className={VALUE}>{character.armorClass}</span>
            <span className={LABEL}>Armor Class</span>
          </>
        }
      >
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
      </Popover>

      {/* Initiative — rollable. */}
      <RollButton
        spec={{ count: 1, faces: 20, modifier: character.initiativeBonus }}
        label="Initiative"
        log={{ kind: "initiative", source: "Initiative" }}
        className={`${CHIP} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50`}
      >
        <span className={VALUE}>{formatModifier(character.initiativeBonus)}</span>
        <span className={LABEL}>Initiative</span>
      </RollButton>

      <StatChip label="Speed" value={`${character.speed} ft`} />

      <StatChip label="Proficiency" value={formatModifier(character.proficiencyBonus)} />

      {/* HP — read-only readout; the Combat tab's tracker owns HP edits. */}
      <div className={CHIP} title="Manage HP on the Combat tab">
        <span className={VALUE}>
          {current}
          <span className="text-sm font-medium text-garnet-100">/{max}</span>
          {temp > 0 && <span className="text-sm font-medium text-arcane-200"> +{temp}</span>}
        </span>
        <span className={LABEL}>Hit Points</span>
      </div>
    </div>
  );
}
