import { activeResistedDamageTypes } from "@/lib/damageTypes";
import type { Character, ClassOption } from "@/types/character";
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
import { useHitPointTrackerActions } from "@/features/hitpoints/useHitPointTrackerActions";

interface HitPointTrackerProps {
  character: Character;
  /** Reference class list (for the level-up new-class picker); defaults to none. */
  referenceClasses?: ClassOption[];
  onUpdate: (character: Character) => void;
}

export default function HitPointTracker({
  character,
  referenceClasses = [],
  onUpdate,
}: HitPointTrackerProps) {
  const { hitPoints, hitDice, abilityScores, pendingLevelUps } = character;
  const conMod = Math.floor((abilityScores.constitution - 10) / 2);

  // Shared HP-apply engine, death-save controls (#736), and rest/level-up actions.
  const hp = useHitPointApply(character, onUpdate);
  const deathSaveCtl = useDeathSaves(character, onUpdate);
  const actions = useHitPointTrackerActions(character, referenceClasses, hp.submit);

  return (
    <Card title="Hit Points">
      <div className="flex flex-col gap-4 p-4">
        <HpMeter
          current={hitPoints.current}
          max={hitPoints.max}
          temp={hitPoints.temp}
          availableDice={actions.availableDice}
          hitDiceTotal={hitDice.total}
          die={hitDice.die}
        />

        <HpDeathSaveBlock ctl={deathSaveCtl} />

        <HpActionControl
          pending={hp.pending}
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
          availableDice={actions.availableDice}
          pending={hp.pending}
          onShortRest={actions.shortRest}
          onLongRest={actions.longRest}
        />

        <HpNotices
          pendingLevelUps={pendingLevelUps}
          pending={hp.pending}
          onLevelUp={() => actions.setLevelUpOpen(true)}
          showAdvancement={actions.advancementCallout}
          onGoToAdvancements={actions.dismissAdvancement}
          concentrationNote={hp.concentrationNote}
          error={hp.error}
        />
      </div>

      <HpTrackerModals
        character={character}
        referenceClasses={referenceClasses}
        conMod={conMod}
        pending={hp.pending}
        levelUpOpen={actions.levelUpOpen}
        onConfirmLevelUp={actions.levelUp}
        onCloseLevelUp={() => actions.setLevelUpOpen(false)}
        pendingSave={hp.pendingSave}
        onResolveSave={hp.resolveConcentrationSave}
        onCloseSave={() => hp.setPendingSave(null)}
      />
    </Card>
  );
}
