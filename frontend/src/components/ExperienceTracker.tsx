import { useState } from "react";

import { updateCharacter } from "../api/client";
import type { Character } from "../types/character";
import Card from "./Card";
import MeterBar from "./MeterBar";

interface ExperienceTrackerProps {
  character: Character;
  onUpdate: (character: Character) => void;
}

export default function ExperienceTracker({
  character,
  onUpdate,
}: ExperienceTrackerProps) {
  const { experiencePoints, currentLevelThreshold, nextLevelThreshold, level } =
    character;
  const [setValue, setSetValue] = useState(String(experiencePoints));
  const [awardValue, setAwardValue] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  const isMaxed = nextLevelThreshold === null;
  const span = isMaxed ? 1 : nextLevelThreshold - currentLevelThreshold;
  const progressIntoLevel = isMaxed ? 1 : experiencePoints - currentLevelThreshold;

  async function submit(newTotal: number) {
    if (!Number.isInteger(newTotal) || newTotal < 0) return;
    setPending(true);
    setError(false);
    try {
      const updated = await updateCharacter(character.id, {
        experiencePoints: newTotal,
      });
      onUpdate(updated);
      setSetValue(String(updated.experiencePoints));
      setAwardValue("");
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <Card
      title="Experience"
      titleAccessory={
        <span className="text-xs font-semibold text-[var(--color-parchment-500)]">
          Level {level}
        </span>
      }
    >
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-baseline justify-between">
          <p className="font-display text-xl font-semibold leading-none text-[var(--color-arcane-800)]">
            {experiencePoints.toLocaleString()}
            <span className="text-sm font-normal text-[var(--color-parchment-500)]">
              {" "}
              XP{!isMaxed && ` / ${nextLevelThreshold.toLocaleString()}`}
            </span>
          </p>
          {isMaxed && (
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-gold-700)]">
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

        <div className="flex flex-wrap items-end gap-3 pt-1">
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-parchment-500)]">
            Set total XP
            <input
              type="number"
              min={0}
              step={1}
              value={setValue}
              onChange={(e) => setSetValue(e.target.value)}
              className="w-28 rounded-[var(--radius-control)] border border-[var(--color-parchment-300)] bg-[var(--color-parchment-50)] px-2 py-1 text-sm tabular-nums text-[var(--color-parchment-900)]"
            />
          </label>
          <button
            type="button"
            disabled={pending}
            onClick={() => submit(Number(setValue))}
            className="rounded-[var(--radius-control)] bg-[var(--color-arcane-700)] px-3 py-1.5 text-sm font-semibold text-[var(--color-parchment-50)] transition-colors hover:bg-[var(--color-arcane-800)] disabled:opacity-50"
          >
            Set
          </button>

          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-parchment-500)]">
            Award XP
            <input
              type="number"
              min={0}
              step={1}
              value={awardValue}
              onChange={(e) => setAwardValue(e.target.value)}
              placeholder="e.g. 450"
              className="w-28 rounded-[var(--radius-control)] border border-[var(--color-parchment-300)] bg-[var(--color-parchment-50)] px-2 py-1 text-sm tabular-nums text-[var(--color-parchment-900)]"
            />
          </label>
          <button
            type="button"
            disabled={pending || !awardValue}
            onClick={() => submit(experiencePoints + Number(awardValue))}
            className="rounded-[var(--radius-control)] bg-[var(--color-garnet-700)] px-3 py-1.5 text-sm font-semibold text-[var(--color-parchment-50)] transition-colors hover:bg-[var(--color-garnet-800)] disabled:opacity-50"
          >
            Add
          </button>
        </div>

        {error && (
          <p className="text-xs font-semibold text-[var(--color-garnet-700)]">
            Couldn't save — try again.
          </p>
        )}
      </div>
    </Card>
  );
}
