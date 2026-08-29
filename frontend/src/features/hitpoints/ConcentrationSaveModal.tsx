import { lazy, Suspense, useState } from "react";

import Modal from "@/components/ui/Modal";
import { useRoll } from "@/features/dice/RollContext";
import type { RollResult } from "@/lib/dice";

const DiceRoller = lazy(() => import("@/features/dice/DiceRoller"));

export interface PendingConcentrationSave {
  entryId: string;
  spellName: string;
  dc: number;
  saveBonus: number;
  damage: number;
}

interface ConcentrationSaveModalProps {
  save: PendingConcentrationSave;
  onResolve: (roll: number) => void | Promise<void>;
  onClose: () => void;
}

export default function ConcentrationSaveModal({
  save,
  onResolve,
  onClose,
}: ConcentrationSaveModalProps) {
  const { logSessionRoll } = useRoll();
  const [phase, setPhase] = useState<"prompt" | "rolling" | "result">("prompt");
  const [outcome, setOutcome] = useState<{ natural: number; total: number; held: boolean } | null>(
    null,
  );

  const bonusLabel = save.saveBonus >= 0 ? `+${save.saveBonus}` : String(save.saveBonus);

  function handleResult(result: RollResult) {
    const natural = result.dice[0]?.value ?? 1;
    const total = natural + save.saveBonus;
    setOutcome({ natural, total, held: total >= save.dc });
    setPhase("result");
    logSessionRoll({
      kind: "save",
      source: `Concentration save (${save.spellName})`,
      ability: "constitution",
      total,
      faces: [natural],
      dc: save.dc,
    });
    void onResolve(natural);
  }

  return (
    <Modal title="Concentration Save" onClose={onClose}>
      <div className="flex flex-col items-center gap-4 text-center">
        <p className="text-sm text-parchment-700">
          Concentrating on{" "}
          <span className="font-semibold text-parchment-900">{save.spellName}</span> — make a
          Constitution saving throw.
        </p>

        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-parchment-600">
          <span className="rounded-control bg-parchment-100 px-2 py-1 text-parchment-700">
            DC {save.dc}
          </span>
          <span className="rounded-control bg-parchment-100 px-2 py-1 text-parchment-700">
            CON save {bonusLabel}
          </span>
        </div>

        {phase === "prompt" ? (
          <button
            type="button"
            onClick={() => setPhase("rolling")}
            className="rounded-control bg-arcane-700 px-5 py-2.5 text-sm font-semibold text-parchment-50 transition-colors hover:bg-arcane-800"
          >
            Roll save
          </button>
        ) : (
          <Suspense fallback={null}>
            <DiceRoller
              spec={{ count: 1, faces: 20 }}
              label={`Concentration save — DC ${save.dc}`}
              onResult={handleResult}
              autoRollOnMount
              showTotal={false}
              className="w-full"
            />
          </Suspense>
        )}

        {phase === "result" && outcome && (
          <div className="flex w-full flex-col items-center gap-3">
            
            <p className="text-sm text-parchment-600">
              Rolled <span className="font-semibold text-parchment-900">{outcome.natural}</span>
              {save.saveBonus !== 0 && (
                <>
                  {" "}
                  {bonusLabel} CON = <span className="font-semibold text-parchment-900">{outcome.total}</span>
                </>
              )}
            </p>
            <p
              className={`text-base font-semibold ${
                outcome.held ? "text-arcane-800" : "text-garnet-800"
              }`}
            >
              {outcome.total} vs DC {save.dc} —{" "}
              {outcome.held
                ? `concentration holds!`
                : `concentration on ${save.spellName} broken`}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="rounded-control bg-parchment-300 px-5 py-2 text-sm font-semibold text-parchment-800 transition-colors hover:bg-parchment-400"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
