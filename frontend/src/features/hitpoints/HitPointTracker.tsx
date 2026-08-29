import { useCurrentCharacter } from "@/hooks/CurrentCharacterProvider";
import { activeResistedDamageTypes } from "@/lib/damageTypes";
import Card from "@/components/ui/Card";
import HpActionControl from "@/features/hitpoints/HpActionControl";
import HpDeathSaveBlock from "@/features/hitpoints/HpDeathSaveBlock";
import HpMeter from "@/features/hitpoints/HpMeter";
import ConcentrationSaveModal from "@/features/hitpoints/ConcentrationSaveModal";
import HpNotices from "@/features/hitpoints/HpNotices";
import RestControls from "@/features/hitpoints/RestControls";
import { useDeathSaves } from "@/features/hitpoints/useDeathSaves";
import { useHitPointApply } from "@/features/hitpoints/useHitPointApply";
import { useRestActions } from "@/features/hitpoints/useRestActions";

export default function HitPointTracker() {
  const { character } = useCurrentCharacter();
  const { hitPoints, hitDice } = character;

  const hp = useHitPointApply(character);
  const deathSaveCtl = useDeathSaves(character);
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

        <RestControls
          availableDice={rest.availableDice}
          pending={hp.pending}
          onShortRest={rest.shortRest}
          onLongRest={rest.longRest}
        />

        <HpNotices concentrationNote={hp.concentrationNote} error={hp.error} />
      </div>

      {hp.pendingSave && (
        <ConcentrationSaveModal
          save={hp.pendingSave}
          onResolve={hp.resolveConcentrationSave}
          onClose={() => hp.setPendingSave(null)}
        />
      )}
    </Card>
  );
}
