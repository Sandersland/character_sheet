import { useState } from "react";
import { Plus } from "lucide-react";

import { applyExperienceOperations } from "@/api/client";
import type { Character } from "@/types/character";
import Card from "@/components/ui/Card";
import MeterBar from "@/components/ui/MeterBar";

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
  const [showSetTotal, setShowSetTotal] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  const isMaxed = nextLevelThreshold === null;
  const span = isMaxed ? 1 : nextLevelThreshold - currentLevelThreshold;
  const progressIntoLevel = isMaxed ? 1 : experiencePoints - currentLevelThreshold;

  async function submitSet(newTotal: number) {
    if (!Number.isInteger(newTotal) || newTotal < 0) return;
    setPending(true);
    setError(false);
    try {
      const updated = await applyExperienceOperations(character.id, [
        { type: "set", value: newTotal },
      ]);
      onUpdate(updated);
      setSetValue(String(updated.experiencePoints));
      setAwardValue("");
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  }

  async function submitAward(amount: number) {
    if (!Number.isInteger(amount) || amount <= 0) return;
    setPending(true);
    setError(false);
    try {
      const updated = await applyExperienceOperations(character.id, [
        { type: "award", amount },
      ]);
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
        <span className="text-xs font-semibold text-parchment-600">
          Level {level}
        </span>
      }
    >
      <div className="flex flex-col gap-3 p-4">
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

        {/* Award XP — primary action */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <input
            type="number"
            min={0}
            step={1}
            value={awardValue}
            onChange={(e) => setAwardValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitAward(Number(awardValue))}
            placeholder="e.g. 450"
            aria-label="XP to award"
            className="w-28 rounded-control border border-parchment-300 bg-parchment-50 px-2 py-1 text-sm tabular-nums text-parchment-900"
          />
          <button
            type="button"
            disabled={pending || !awardValue}
            onClick={() => submitAward(Number(awardValue))}
            className="inline-flex items-center gap-1.5 rounded-control bg-garnet-700 px-3 py-1.5 text-sm font-semibold text-parchment-50 transition-colors hover:bg-garnet-800 disabled:opacity-50"
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
            Award XP
          </button>
        </div>

        {/* Set exact total — low-emphasis disclosure */}
        {!showSetTotal ? (
          <button
            type="button"
            onClick={() => setShowSetTotal(true)}
            className="self-start text-xs font-semibold text-parchment-600 hover:underline"
          >
            Set exact total…
          </button>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="number"
              min={0}
              step={1}
              value={setValue}
              onChange={(e) => setSetValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitSet(Number(setValue))}
              aria-label="Exact XP total"
              className="w-28 rounded-control border border-parchment-300 bg-parchment-50 px-2 py-1 text-sm tabular-nums text-parchment-900"
            />
            <button
              type="button"
              disabled={pending}
              onClick={() => submitSet(Number(setValue))}
              className="rounded-control bg-parchment-300 px-3 py-1.5 text-sm font-semibold text-parchment-800 transition-colors hover:bg-parchment-400 disabled:opacity-50"
            >
              Set
            </button>
          </div>
        )}

        {error && (
          <p className="text-xs font-semibold text-garnet-700">
            Couldn't save — try again.
          </p>
        )}
      </div>
    </Card>
  );
}
