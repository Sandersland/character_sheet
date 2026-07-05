import { useEffect } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import { logRoll } from "@/api/client";
import ConcentrationSaveModal, {
  type PendingConcentrationSave,
} from "@/features/hitpoints/ConcentrationSaveModal";
import { RollProvider } from "@/features/dice/RollContext";
import type { RollResult } from "@/lib/dice";

vi.mock("@/api/client", () => ({
  logRoll: vi.fn().mockResolvedValue(undefined),
}));

// Stub the 3D roller: fire onResult once on mount with a fixed natural d20 (12).
const NATURAL = 12;
vi.mock("@/features/dice/DiceRoller", () => ({
  default: function MockDiceRoller({ onResult }: { onResult?: (r: RollResult) => void }) {
    useEffect(() => {
      onResult?.({
        dice: [{ value: NATURAL, dropped: false }],
        modifier: 0,
        total: NATURAL,
        spec: { count: 1, faces: 20 },
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return <div data-testid="dice-roller" />;
  },
}));

const mockLogRoll = vi.mocked(logRoll);

const save: PendingConcentrationSave = {
  entryId: "entry-1",
  spellName: "Bless",
  dc: 10,
  saveBonus: 3,
  damage: 6,
};

function renderModal(sessionId: string | null) {
  return render(
    <RollProvider characterId="char-1" sessionId={sessionId}>
      <ConcentrationSaveModal save={save} onResolve={vi.fn()} onClose={vi.fn()} />
    </RollProvider>,
  );
}

describe("ConcentrationSaveModal session logging", () => {
  beforeEach(() => mockLogRoll.mockClear());

  it("emits a saveRoll event when in an active session", async () => {
    renderModal("sess-1");

    // Kick off the roll (die auto-rolls once mounted).
    screen.getByRole("button", { name: /roll save/i }).click();

    await waitFor(() => expect(mockLogRoll).toHaveBeenCalledTimes(1));
    const [cid, sid, payload] = mockLogRoll.mock.calls[0];
    expect(cid).toBe("char-1");
    expect(sid).toBe("sess-1");
    expect(payload).toMatchObject({
      kind: "save",
      ability: "constitution",
      source: "Concentration save (Bless)",
      total: NATURAL + save.saveBonus,
      faces: [NATURAL],
      dc: save.dc,
    });
  });

  it("does not log outside an active session", async () => {
    renderModal(null);
    screen.getByRole("button", { name: /roll save/i }).click();
    await Promise.resolve();
    expect(mockLogRoll).not.toHaveBeenCalled();
  });
});
