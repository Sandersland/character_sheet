import { activeResistedDamageTypes } from "@/lib/damageTypes";
import type { Character } from "@/types/character";
import HpActionControl from "@/features/hitpoints/HpActionControl";
import AutoRollConcentrationToggle from "@/features/hitpoints/AutoRollConcentrationToggle";
import ConcentrationNoteBanner from "@/features/hitpoints/ConcentrationNoteBanner";
import ConcentrationSaveModal from "@/features/hitpoints/ConcentrationSaveModal";
import { useHitPointApply } from "@/features/hitpoints/useHitPointApply";

interface HpSheetBodyProps {
  character: Character;
  onUpdate: (character: Character) => void;
}

/**
 * The interactive body of the session HP sheet (#768): the shared HpActionControl
 * plus concentration surfacing, both wired through useHitPointApply so damage,
 * heal, temp HP, and concentration checks behave identically to the Rest tab.
 */
export default function HpSheetBody({ character, onUpdate }: HpSheetBodyProps) {
  const hp = useHitPointApply(character, onUpdate);
  const resistedTypes = [...activeResistedDamageTypes(character.activeEffects?.buffs ?? [])];

  return (
    <div className="flex flex-col gap-4">
      <HpActionControl pending={hp.pending} onApply={hp.handleApply} resistedTypes={resistedTypes} />

      {hp.isSpellcaster && (
        <AutoRollConcentrationToggle
          checked={hp.autoRollConcentration}
          onChange={hp.setAutoRollConcentration}
          disabled={hp.pending}
        />
      )}

      {hp.concentrationNote && <ConcentrationNoteBanner note={hp.concentrationNote} />}

      {hp.error && <p className="text-xs font-semibold text-garnet-700">{hp.error}</p>}

      {hp.pendingSave && (
        <ConcentrationSaveModal
          save={hp.pendingSave}
          onResolve={hp.resolveConcentrationSave}
          onClose={() => hp.setPendingSave(null)}
        />
      )}
    </div>
  );
}
