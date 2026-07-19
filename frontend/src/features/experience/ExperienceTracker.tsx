import { useState } from "react";
import { Plus } from "lucide-react";

import { applyExperienceOperations } from "@/api/client";
import type { Character, ExperienceOperation } from "@/types/character";
import Card from "@/components/ui/Card";
import MeterBar from "@/components/ui/MeterBar";

interface ExperienceTrackerProps {
  character: Character;
  onUpdate: (character: Character) => void;
}

type ApplyXp = (op: ExperienceOperation) => Promise<Character | null>;

// One XP mutation with shared pending + error state; resolves to the updated
// character (or null on failure) so callers can resync their input fields.
function useExperienceActions(character: Character, onUpdate: (c: Character) => void) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  const apply: ApplyXp = async (op) => {
    setPending(true);
    setError(false);
    try {
      const updated = await applyExperienceOperations(character.id, [op]);
      onUpdate(updated);
      return updated;
    } catch {
      setError(true);
      return null;
    } finally {
      setPending(false);
    }
  };

  return { pending, error, apply };
}

export default function ExperienceTracker({ character, onUpdate }: ExperienceTrackerProps) {
  const { pending, error, apply } = useExperienceActions(character, onUpdate);

  return (
    <Card
      title="Experience"
      titleAccessory={
        <span className="text-xs font-semibold text-parchment-600">
          Level {character.level}
        </span>
      }
    >
      <div className="flex flex-col gap-3 p-4">
        <ExperienceMeter character={character} />
        <AwardXpForm pending={pending} apply={apply} />
        <SetExactTotalRow
          pending={pending}
          apply={apply}
          experiencePoints={character.experiencePoints}
        />
        {error && (
          <p className="text-xs font-semibold text-garnet-700">
            Couldn't save — try again.
          </p>
        )}
      </div>
    </Card>
  );
}

function ExperienceMeter({ character }: { character: Character }) {
  const { experiencePoints, currentLevelThreshold, nextLevelThreshold, level } = character;
  const isMaxed = nextLevelThreshold === null;
  const span = isMaxed ? 1 : nextLevelThreshold - currentLevelThreshold;
  const progressIntoLevel = isMaxed ? 1 : experiencePoints - currentLevelThreshold;

  return (
    <>
      <div className="flex items-baseline justify-between">
        <p className="font-display text-xl font-semibold leading-none text-arcane-800">
          {experiencePoints.toLocaleString()}
          <span className="text-sm font-normal text-parchment-600">
            {" "}
            XP{!isMaxed && ` / ${nextLevelThreshold.toLocaleString()}`}
          </span>
        </p>
        {isMaxed && (
          <span className="text-xs font-semibold uppercase tracking-wide text-gold-800">
            Max level
          </span>
        )}
      </div>

      <MeterBar
        current={progressIntoLevel}
        max={span}
        tone="arcane"
        label={
          isMaxed
            ? "Maximum level reached"
            : `${progressIntoLevel} of ${span} experience points toward level ${level + 1}`
        }
      />

      {!isMaxed && (
        <p className="text-xs font-semibold text-parchment-600">
          {(nextLevelThreshold - experiencePoints).toLocaleString()} XP to Level {level + 1}
        </p>
      )}
    </>
  );
}

function AwardXpForm({ pending, apply }: { pending: boolean; apply: ApplyXp }) {
  const [awardValue, setAwardValue] = useState("");

  async function submit() {
    const amount = Number(awardValue);
    if (!Number.isInteger(amount) || amount <= 0) return;
    if (await apply({ type: "award", amount })) setAwardValue("");
  }

  return (
    <div className="flex flex-wrap items-center gap-2 pt-1">
      <input
        type="number"
        min={0}
        step={1}
        value={awardValue}
        onChange={(e) => setAwardValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="e.g. 450"
        aria-label="XP to award"
        className="w-28 rounded-control border border-parchment-300 bg-parchment-50 px-2 py-1 text-base md:text-sm tabular-nums text-parchment-900"
      />
      <button
        type="button"
        disabled={pending || !awardValue}
        onClick={submit}
        className="inline-flex items-center gap-1.5 rounded-control bg-garnet-700 px-3 py-1.5 text-sm font-semibold text-parchment-50 transition-colors hover:bg-garnet-800 disabled:opacity-50"
      >
        <Plus aria-hidden="true" className="h-4 w-4" />
        Award XP
      </button>
    </div>
  );
}

function SetExactTotalRow({
  pending,
  apply,
  experiencePoints,
}: {
  pending: boolean;
  apply: ApplyXp;
  experiencePoints: number;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(String(experiencePoints));

  async function submit() {
    const total = Number(value);
    if (!Number.isInteger(total) || total < 0) return;
    const updated = await apply({ type: "set", value: total });
    if (updated) setValue(String(updated.experiencePoints));
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          // Seed from the live total so the field opens on the current XP.
          setValue(String(experiencePoints));
          setOpen(true);
        }}
        className="self-start text-xs font-semibold text-parchment-600 hover:underline"
      >
        Set exact total…
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="number"
        min={0}
        step={1}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        aria-label="Exact XP total"
        className="w-28 rounded-control border border-parchment-300 bg-parchment-50 px-2 py-1 text-base md:text-sm tabular-nums text-parchment-900"
      />
      <button
        type="button"
        disabled={pending}
        onClick={submit}
        className="rounded-control bg-parchment-300 px-3 py-1.5 text-sm font-semibold text-parchment-800 transition-colors hover:bg-parchment-400 disabled:opacity-50"
      >
        Set
      </button>
    </div>
  );
}
