import { formatModifier } from "@/lib/abilities";
import Popover from "@/components/ui/Popover";
import ArmorClassBreakdown from "@/features/character-meta/ArmorClassBreakdown";
import RollButton from "@/features/dice/RollButton";
import ManageHpButton from "@/features/hitpoints/ManageHpButton";
import type { Character } from "@/types/character";

/**
 * Always-on vitals chips for the sheet banner — AC / Initiative / Speed / HP.
 *
 * These are the only combat numbers that stay visible across every tab. Styled
 * for the garnet banner (translucent-white chips, light text). AC keeps its
 * labeled breakdown popover and Initiative stays rollable. HP is the tappable
 * HP surface (#982): with `onUpdate` the chip opens the shared "Hit Points"
 * sheet — the live-Combat panel no longer carries its own `CompactHpBar`, so the
 * header meter is the entry point. Without `onUpdate` it degrades to a read-only
 * readout (test/preview callers).
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

export default function BannerVitals({
  character,
  onUpdate,
}: {
  character: Character;
  /** Opens the shared HP sheet from the HP chip; omit for a read-only readout. */
  onUpdate?: (character: Character) => void;
}) {
  const { current, max, temp } = character.hitPoints;

  const hpReadout = (
    <>
      <span className={VALUE}>
        {current}
        <span className="text-sm font-medium text-garnet-100">/{max}</span>
        {temp > 0 && <span className="text-sm font-medium text-arcane-200"> +{temp}</span>}
      </span>
      <span className={LABEL}>Hit Points</span>
    </>
  );

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
        <ArmorClassBreakdown character={character} />
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

      {/* HP — the tappable HP surface (#982): opens the shared "Hit Points" sheet.
          Read-only readout when no onUpdate (test/preview callers). */}
      {onUpdate ? (
        <ManageHpButton
          character={character}
          onUpdate={onUpdate}
          className={`${CHIP} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50`}
        >
          {hpReadout}
        </ManageHpButton>
      ) : (
        <div className={CHIP} title="Manage HP on the Combat tab">
          {hpReadout}
        </div>
      )}
    </div>
  );
}
