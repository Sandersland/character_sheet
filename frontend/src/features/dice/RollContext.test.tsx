import { useEffect } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import { logRollAction } from "@/api/client";
import { RollProvider, useRoll, type RollLog } from "@/features/dice/RollContext";
import { DiceRollStyleProvider } from "@/features/dice/DiceRollStyleProvider";
import RollResultSeal from "@/features/dice/RollResultSeal";
import type { RollResult, RollSpec } from "@/lib/dice";

vi.mock("@/api/client", () => ({
  logRollAction: vi.fn().mockResolvedValue(undefined),
}));

const NATURAL = 17;
vi.mock("@/features/dice/DiceRoller", () => ({
  default: function MockDiceRoller({
    onResult,
    spec,
  }: {
    onResult?: (r: RollResult) => void;
    spec?: RollSpec;
  }) {
    useEffect(() => {
      const modifier = spec?.modifier ?? 0;
      onResult?.({
        dice: [{ value: NATURAL, dropped: false }],
        modifier,
        total: NATURAL + modifier,
        spec: { count: 1, faces: 20, modifier, mode: spec?.mode },
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps -- mock fires onResult once on mount; empty deps intentional
    }, []);
    return <div data-testid="dice-roller" />;
  },
}));

const mockLogRoll = vi.mocked(logRollAction);

function AnimatedRollOnMount({ spec, label, log }: { spec: RollSpec; label: string; log?: RollLog }) {
  const { rollAnimated } = useRoll();
  useEffect(() => {
    rollAnimated(spec, label, log);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- harness rolls once on mount; empty deps intentional
  }, []);
  return null;
}

describe("RollProvider — rollAnimated + logging", () => {
  beforeEach(() => {
    mockLogRoll.mockClear();
    localStorage.clear();
  });

  it("animated: plays the 3D dice, then settles into the shared result seal, and logs", async () => {
    render(
      <DiceRollStyleProvider>
        <RollProvider characterId="char-1" sessionId="sess-1">
          <AnimatedRollOnMount
            spec={{ count: 1, faces: 20, modifier: 5 }}
            label="Perception check"
            log={{ kind: "check", source: "Perception check", ability: "wisdom", skill: "perception" }}
          />
          <RollResultSeal />
        </RollProvider>
      </DiceRollStyleProvider>,
    );

    await waitFor(() => expect(mockLogRoll).toHaveBeenCalledTimes(1));

    const seal = await screen.findByTestId("roll-result-seal");
    expect(seal).toHaveTextContent("22");
    expect(screen.queryByTestId("dice-roller")).not.toBeInTheDocument();

    const [cid, payload] = mockLogRoll.mock.calls[0];
    expect(cid).toBe("char-1");
    // No sessionId on the wire; the resolver derives it from the active session.
    expect(payload).toMatchObject({
      kind: "check",
      source: "Perception check",
      ability: "wisdom",
      skill: "perception",
      total: 22,
      faces: [NATURAL],
    });
  });

  it("quick: skips the 3D dice and lands the result on the seal directly", async () => {
    localStorage.setItem("cs:pref:diceRoll", "quick");
    render(
      <DiceRollStyleProvider>
        <RollProvider characterId="char-1" sessionId="sess-1">
          <AnimatedRollOnMount
            spec={{ count: 1, faces: 20, modifier: 5 }}
            label="Perception check"
            log={{ kind: "check", source: "Perception check", ability: "wisdom", skill: "perception" }}
          />
          <RollResultSeal />
        </RollProvider>
      </DiceRollStyleProvider>,
    );

    const chip = await screen.findByTestId("roll-result-seal");
    expect(chip).toHaveTextContent("Perception check");
    expect(screen.queryByTestId("dice-roller")).not.toBeInTheDocument();
    await waitFor(() => expect(mockLogRoll).toHaveBeenCalledTimes(1));
    expect(mockLogRoll.mock.calls[0][1]).toMatchObject({ kind: "check", skill: "perception" });
  });

  it("does not log when no session is active (still settles into the seal)", async () => {
    render(
      <RollProvider characterId="char-1" sessionId={null}>
        <AnimatedRollOnMount
          spec={{ count: 1, faces: 20, modifier: 2 }}
          label="Strength save"
          log={{ kind: "save", source: "Strength save", ability: "strength" }}
        />
        <RollResultSeal />
      </RollProvider>,
    );

    expect(await screen.findByTestId("roll-result-seal")).toBeInTheDocument();
    expect(mockLogRoll).not.toHaveBeenCalled();
  });

  it("does not log a roll without a log payload, even in a session", async () => {
    render(
      <RollProvider characterId="char-1" sessionId="sess-1">
        <AnimatedRollOnMount spec={{ count: 1, faces: 20 }} label="Bare roll" />
        <RollResultSeal />
      </RollProvider>,
    );

    expect(await screen.findByTestId("roll-result-seal")).toBeInTheDocument();
    expect(mockLogRoll).not.toHaveBeenCalled();
  });

  it("carries a per-roll spec.mode onto the logged event", async () => {
    function AdvantageRoll() {
      const { rollAnimated } = useRoll();
      useEffect(() => {
        rollAnimated({ count: 1, faces: 20, modifier: 1, mode: "advantage" }, "Initiative", {
          kind: "initiative",
          source: "Initiative",
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps -- harness rolls once on mount; empty deps intentional
      }, []);
      return null;
    }

    render(
      <RollProvider characterId="char-1" sessionId="sess-1">
        <AdvantageRoll />
      </RollProvider>,
    );

    await waitFor(() => expect(mockLogRoll).toHaveBeenCalledTimes(1));
    expect(mockLogRoll.mock.calls[0][1]).toMatchObject({
      kind: "initiative",
      rollMode: "advantage",
    });
  });

  it("carries the dropped d20 face in droppedFaces on an advantage roll (quick style, real dice engine)", async () => {
    localStorage.setItem("cs:pref:diceRoll", "quick");
    const randomSpy = vi
      .spyOn(Math, "random")
      // rollDie(20) = 1 + floor(random * 20): 0.72 -> 15 (kept, higher), 0.22 -> 5 (dropped).
      .mockReturnValueOnce(0.72)
      .mockReturnValueOnce(0.22);

    render(
      <DiceRollStyleProvider>
        <RollProvider characterId="char-1" sessionId="sess-1">
          <AnimatedRollOnMount
            spec={{ count: 1, faces: 20, modifier: 1, mode: "advantage" }}
            label="Initiative"
            log={{ kind: "initiative", source: "Initiative" }}
          />
        </RollProvider>
      </DiceRollStyleProvider>,
    );

    await waitFor(() => expect(mockLogRoll).toHaveBeenCalledTimes(1));
    expect(mockLogRoll.mock.calls[0][1]).toMatchObject({
      faces: [15],
      droppedFaces: [5],
    });
    randomSpy.mockRestore();
  });

  it("omits droppedFaces entirely for a normal roll with no dropped die", async () => {
    render(
      <DiceRollStyleProvider>
        <RollProvider characterId="char-1" sessionId="sess-1">
          <AnimatedRollOnMount
            spec={{ count: 1, faces: 20, modifier: 5 }}
            label="Perception check"
            log={{ kind: "check", source: "Perception check", ability: "wisdom", skill: "perception" }}
          />
          <RollResultSeal />
        </RollProvider>
      </DiceRollStyleProvider>,
    );

    await waitFor(() => expect(mockLogRoll).toHaveBeenCalledTimes(1));
    expect(mockLogRoll.mock.calls[0][1]).not.toHaveProperty("droppedFaces");
  });
});
