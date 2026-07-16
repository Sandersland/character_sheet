import { useEffect } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import { logRoll } from "@/api/client";
import { RollProvider, useRoll, type RollLog } from "@/features/dice/RollContext";
import { DiceRollStyleProvider } from "@/features/dice/DiceRollStyleProvider";
import RollResultToast from "@/features/dice/RollResultToast";
import type { RollResult, RollSpec } from "@/lib/dice";

vi.mock("@/api/client", () => ({
  logRoll: vi.fn().mockResolvedValue(undefined),
}));

// Stub the 3D DiceRoller (mounts a Three.js Canvas that doesn't render in jsdom):
// fire onResult once on mount with a fixed natural d20 (17) plus the spec modifier.
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
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return <div data-testid="dice-roller" />;
  },
}));

const mockLogRoll = vi.mocked(logRoll);

function AnimatedRollOnMount({ spec, label, log }: { spec: RollSpec; label: string; log?: RollLog }) {
  const { rollAnimated } = useRoll();
  useEffect(() => {
    rollAnimated(spec, label, log);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

describe("RollProvider — rollAnimated + logging", () => {
  beforeEach(() => {
    mockLogRoll.mockClear();
    localStorage.clear();
  });

  it("animated: plays the 3D dice, shows the result in the modal (no persistent toast), and logs", async () => {
    render(
      <DiceRollStyleProvider>
        <RollProvider characterId="char-1" sessionId="sess-1">
          <AnimatedRollOnMount
            spec={{ count: 1, faces: 20, modifier: 5 }}
            label="Perception check"
            log={{ kind: "check", source: "Perception check", ability: "wisdom", skill: "perception" }}
          />
          <RollResultToast />
        </RollProvider>
      </DiceRollStyleProvider>,
    );

    // 3D roller mounted in an overlay dialog (lazy-loaded behind Suspense).
    expect(await screen.findByTestId("dice-roller")).toBeInTheDocument();
    await waitFor(() => expect(mockLogRoll).toHaveBeenCalledTimes(1));

    // The modal itself shows the total (17 + 5) — the persistent chip stays away.
    const modalResult = await screen.findByTestId("roll-modal-result");
    expect(modalResult).toHaveTextContent("22");
    expect(screen.queryByTestId("roll-result-toast")).not.toBeInTheDocument();

    const [cid, sid, payload] = mockLogRoll.mock.calls[0];
    expect(cid).toBe("char-1");
    expect(sid).toBe("sess-1");
    expect(payload).toMatchObject({
      kind: "check",
      source: "Perception check",
      ability: "wisdom",
      skill: "perception",
      total: 22,
      faces: [NATURAL],
    });
  });

  it("quick: skips the 3D dice and shows the compact chip with the result", async () => {
    localStorage.setItem("cs:pref:diceRoll", "quick");
    render(
      <DiceRollStyleProvider>
        <RollProvider characterId="char-1" sessionId="sess-1">
          <AnimatedRollOnMount
            spec={{ count: 1, faces: 20, modifier: 5 }}
            label="Perception check"
            log={{ kind: "check", source: "Perception check", ability: "wisdom", skill: "perception" }}
          />
          <RollResultToast />
        </RollProvider>
      </DiceRollStyleProvider>,
    );

    // No 3D overlay; the compact chip carries the result and it still logs.
    const chip = await screen.findByTestId("roll-result-toast");
    expect(chip).toHaveTextContent("Perception check");
    expect(screen.queryByTestId("dice-roller")).not.toBeInTheDocument();
    await waitFor(() => expect(mockLogRoll).toHaveBeenCalledTimes(1));
    expect(mockLogRoll.mock.calls[0][2]).toMatchObject({ kind: "check", skill: "perception" });
  });

  it("does not log when no session is active (still animates)", async () => {
    render(
      <RollProvider characterId="char-1" sessionId={null}>
        <AnimatedRollOnMount
          spec={{ count: 1, faces: 20, modifier: 2 }}
          label="Strength save"
          log={{ kind: "save", source: "Strength save", ability: "strength" }}
        />
      </RollProvider>,
    );

    expect(await screen.findByTestId("dice-roller")).toBeInTheDocument();
    // Give any async logging a chance to (not) fire.
    await Promise.resolve();
    expect(mockLogRoll).not.toHaveBeenCalled();
  });

  it("does not log a roll without a log payload, even in a session", async () => {
    render(
      <RollProvider characterId="char-1" sessionId="sess-1">
        <AnimatedRollOnMount spec={{ count: 1, faces: 20 }} label="Bare roll" />
      </RollProvider>,
    );

    expect(await screen.findByTestId("dice-roller")).toBeInTheDocument();
    await Promise.resolve();
    expect(mockLogRoll).not.toHaveBeenCalled();
  });

  it("carries the sticky roll mode onto the logged event", async () => {
    function AdvantageRoll() {
      const { rollAnimated, setMode } = useRoll();
      useEffect(() => {
        setMode("advantage");
      }, [setMode]);
      useEffect(() => {
        // Fire after the mode is applied.
        const t = setTimeout(
          () =>
            rollAnimated({ count: 1, faces: 20, modifier: 1 }, "Initiative", {
              kind: "initiative",
              source: "Initiative",
            }),
          0,
        );
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
      return null;
    }

    render(
      <RollProvider characterId="char-1" sessionId="sess-1">
        <AdvantageRoll />
      </RollProvider>,
    );

    await waitFor(() => expect(mockLogRoll).toHaveBeenCalledTimes(1));
    expect(mockLogRoll.mock.calls[0][2]).toMatchObject({
      kind: "initiative",
      rollMode: "advantage",
    });
  });
});
