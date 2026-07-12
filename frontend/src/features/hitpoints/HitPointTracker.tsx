import { useEffect, useRef, useState } from "react";

import { rollDie } from "@/lib/dice";
import { dieFaces } from "@/lib/hitDice";
import { activeResistedDamageTypes } from "@/lib/damageTypes";
import type { Character, ClassOption, LevelUpTarget } from "@/types/character";
import Card from "@/components/ui/Card";
import AdvancementCallout from "@/features/hitpoints/AdvancementCallout";
import ConcentrationSaveModal from "@/features/hitpoints/ConcentrationSaveModal";
import ConcentrationNoteBanner from "@/features/hitpoints/ConcentrationNoteBanner";
import AutoRollConcentrationToggle from "@/features/hitpoints/AutoRollConcentrationToggle";
import DeathSaveTracker from "@/features/hitpoints/DeathSaveTracker";
import { useDeathSaves } from "@/features/hitpoints/useDeathSaves";
import LevelUpCallout from "@/features/hitpoints/LevelUpCallout";
import HpActionControl from "@/features/hitpoints/HpActionControl";
import HpMeter from "@/features/hitpoints/HpMeter";
import LevelUpModal from "@/features/hitpoints/LevelUpModal";
import RestControls from "@/features/hitpoints/RestControls";
import { useHitPointApply } from "@/features/hitpoints/useHitPointApply";

interface HitPointTrackerProps {
  character: Character;
  /** Reference class list (for the level-up new-class picker); defaults to none. */
  referenceClasses?: ClassOption[];
  onUpdate: (character: Character) => void;
}

// fallow-ignore-next-line complexity -- #768 grew this past the gate; decomposition tracked in #779
export default function HitPointTracker({
  character,
  referenceClasses = [],
  onUpdate,
}: HitPointTrackerProps) {
  const { hitPoints, hitDice, abilityScores, pendingLevelUps } = character;
  const availableDice = hitDice.total - hitDice.spent;
  const conMod = Math.floor((abilityScores.constitution - 10) / 2);

  // Shared HP-apply engine — submits ops + surfaces concentration checks (#768).
  const hp = useHitPointApply(character, onUpdate);
  const {
    pending,
    error,
    concentrationNote,
    pendingSave,
    setPendingSave,
    isSpellcaster,
    autoRollConcentration,
    setAutoRollConcentration,
    submit,
    handleApply,
    resolveConcentrationSave,
  } = hp;

  // Modal / callout state
  const [levelUpOpen, setLevelUpOpen] = useState(false);
  const [advancementCallout, setAdvancementCallout] = useState(false);

  // Detect when a level-up unlocks a new advancement slot.
  const prevAdvancementTotal = useRef(character.advancementSlots.total);
  useEffect(() => {
    const newTotal = character.advancementSlots.total;
    if (newTotal > prevAdvancementTotal.current) {
      setAdvancementCallout(true);
    }
    prevAdvancementTotal.current = newTotal;
  }, [character.advancementSlots.total]);

  // Death-save controls (#736) — shared with the turn UI via useDeathSaves.
  const deathSaveCtl = useDeathSaves(character, onUpdate);

  async function handleShortRest(n: number) {
    if (!n || n < 1 || n > availableDice) return;
    const faces = dieFaces(hitDice.die);
    const rolls = Array.from({ length: n }, () => rollDie(faces));
    await submit([{ type: "shortRest", rolls }]);
  }

  async function handleLongRest() {
    await submit([{ type: "longRest" }]);
  }

  async function handleLevelUp(method: "average" | "roll", target: LevelUpTarget | undefined) {
    // Roll bounds follow the ADVANCING class's hit die, which may differ from the
    // primary (position-0) die once multiclassing is in play.
    const advancingName =
      target?.kind === "new"
        ? referenceClasses.find((c) => c.id === target.classId)?.name
        : character.classes?.find((e) => e.id === target?.classEntryId)?.name;
    const advancingDie =
      referenceClasses.find((c) => c.name === advancingName)?.hitDie ?? hitDice.die;
    const roll = method === "roll" ? rollDie(dieFaces(advancingDie)) : undefined;
    const ok = await submit([{ type: "levelUp", method, roll, target }]);
    if (ok) setLevelUpOpen(false);
    // Advancement callout is triggered by the useEffect watching advancementSlots.total.
  }

  return (
    <Card title="Hit Points">
      <div className="flex flex-col gap-4 p-4">
        {/* ── HP display ── */}
        <HpMeter
          current={hitPoints.current}
          max={hitPoints.max}
          temp={hitPoints.temp}
          availableDice={availableDice}
          hitDiceTotal={hitDice.total}
          die={hitDice.die}
        />

        {/* ── Death save tracker (shown at 0 HP) ── */}
        {deathSaveCtl.isDying && (
          <div className="flex flex-col gap-2">
            <DeathSaveTracker
              deathSaves={deathSaveCtl.deathSaves}
              pending={deathSaveCtl.pending}
              onRollDeathSave={deathSaveCtl.onRollDeathSave}
              onStabilize={deathSaveCtl.onStabilize}
            />
            {deathSaveCtl.error && (
              <p className="text-xs font-semibold text-garnet-700">{deathSaveCtl.error}</p>
            )}
          </div>
        )}

        {/* ── HP action control (segmented mode + stepper + verb) ── */}
        <HpActionControl
          pending={pending}
          onApply={handleApply}
          resistedTypes={[...activeResistedDamageTypes(character.activeEffects?.buffs ?? [])]}
        />

        {/* ── Concentration save preference (spellcasters only, issue #76) ── */}
        {isSpellcaster && (
          <AutoRollConcentrationToggle
            checked={autoRollConcentration}
            onChange={setAutoRollConcentration}
            disabled={pending}
          />
        )}

        {/* ── Rest controls ── */}
        <RestControls
          availableDice={availableDice}
          pending={pending}
          onShortRest={handleShortRest}
          onLongRest={handleLongRest}
        />

        {/* ── Level-up affordance ── */}
        {pendingLevelUps > 0 && (
          <LevelUpCallout
            pendingLevelUps={pendingLevelUps}
            pending={pending}
            onLevelUp={() => setLevelUpOpen(true)}
          />
        )}

        {/* ── Advancement slot unlocked callout ── */}
        {advancementCallout && (
          <AdvancementCallout
            onGoToAdvancements={() => {
              setAdvancementCallout(false);
              document.getElementById("advancement-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          />
        )}

        {/* Concentration save result (issue #41, auto-roll path) */}
        {concentrationNote && <ConcentrationNoteBanner note={concentrationNote} />}

        {/* Error display */}
        {error && (
          <p className="text-xs font-semibold text-garnet-700">{error}</p>
        )}
      </div>

      {/* Level-up modal */}
      {levelUpOpen && (
        <LevelUpModal
          character={character}
          referenceClasses={referenceClasses}
          conMod={conMod}
          pending={pending}
          onConfirm={handleLevelUp}
          onClose={() => setLevelUpOpen(false)}
        />
      )}

      {/* Manual concentration-save modal (issue #76) */}
      {pendingSave && (
        <ConcentrationSaveModal
          save={pendingSave}
          onResolve={resolveConcentrationSave}
          onClose={() => setPendingSave(null)}
        />
      )}
    </Card>
  );
}
