import { activeResistedDamageTypes } from "@/lib/damageTypes";
import type { Character } from "@/types/character";
import Card from "@/components/ui/Card";
import AutoRollConcentrationToggle from "@/features/hitpoints/AutoRollConcentrationToggle";
import HpActionControl from "@/features/hitpoints/HpActionControl";
import HpDeathSaveBlock from "@/features/hitpoints/HpDeathSaveBlock";
import HpMeter from "@/features/hitpoints/HpMeter";
import HpNotices from "@/features/hitpoints/HpNotices";
import HpTrackerModals from "@/features/hitpoints/HpTrackerModals";
import RestControls from "@/features/hitpoints/RestControls";
import { useDeathSaves } from "@/features/hitpoints/useDeathSaves";
import { useHitPointApply } from "@/features/hitpoints/useHitPointApply";
import { useRestActions } from "@/features/hitpoints/useRestActions";

interface HitPointTrackerProps {
  character: Character;
  onUpdate: (character: Character) => void;
}

export default function HitPointTracker({ character, onUpdate }: HitPointTrackerProps) {
  const { hitPoints, hitDice } = character;

  // Shared HP-apply engine, death-save controls (#736), and rest actions.
  const hp = useHitPointApply(character, onUpdate);
  const deathSaveCtl = useDeathSaves(character, onUpdate);
  const rest = useRestActions(character, hp.submit);

  return (
    <Card title="Hit Points">
      <div className="flex flex-col gap-4 p-4">
        <HpMeter
          current={hitPoints.current}
          max={hitPoints.max}
          temp={hitPoints.temp}
          availableDice={rest.availableDice}
          hitDiceTotal={hitDice.total}
          die={hitDice.die}
        />

        <HpDeathSaveBlock ctl={deathSaveCtl} />

        <HpActionControl
          pending={hp.pending}
          hitPoints={hitPoints}
          onApply={hp.handleApply}
          resistedTypes={[...activeResistedDamageTypes(character.activeEffects?.buffs ?? [])]}
        />

        {/* Concentration save preference (spellcasters only, #76) */}
        {hp.isSpellcaster && (
          <AutoRollConcentrationToggle
            checked={hp.autoRollConcentration}
            onChange={hp.setAutoRollConcentration}
            disabled={hp.pending}
          />
        )}

        <RestControls
          availableDice={rest.availableDice}
          pending={hp.pending}
          onShortRest={rest.shortRest}
          onLongRest={rest.longRest}
        />

        <HpNotices concentrationNote={hp.concentrationNote} error={hp.error} />
      </div>

      <HpTrackerModals
        pendingSave={hp.pendingSave}
        onResolveSave={hp.resolveConcentrationSave}
        onCloseSave={() => hp.setPendingSave(null)}
      />
    </Card>
  );
}
