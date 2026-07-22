/**
 * Direct DisciplineRow pins (#688) — before this file the row was covered only
 * transitively through DisciplinesSection.test.tsx. Pins the cast affordance
 * (affordability gating + disabled title), focus-scaling select, Forget confirm,
 * Swap, and the expandable description/roll preview, so the shared-row-shell
 * extraction can't silently change behavior.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import DisciplineRow from "@/features/class/DisciplineRow";
import { RollProvider } from "@/features/dice/RollContext";
import type { CatalogDiscipline, DisciplineEntry } from "@/types/character";

const ENTRY: DisciplineEntry = {
  id: "entry-1",
  disciplineId: "fangs",
  name: "Fangs of the Fire Snake",
  description: "Extend reach and deal fire damage.",
};

const FANGS: CatalogDiscipline = {
  id: "fangs",
  name: "Fangs of the Fire Snake",
  description: "Extend reach and deal fire damage.",
  minLevel: 3,
  alwaysKnown: false,
  saveAbility: null,
  cost: { kind: "pool", key: "focus", base: 1, perStep: 1 },
  effect: {
    effectType: "damage",
    dice: { count: 1, faces: 10, modifier: 0 },
    damageType: "fire",
    attackType: "attack",
    saveAbility: null,
    saveEffect: null,
    scaling: { mode: "focus", dicePerStep: 1 },
  },
};

const THUNDERS: CatalogDiscipline = {
  id: "thunders",
  name: "Fist of Four Thunders",
  description: "Cast thunderwave.",
  minLevel: 3,
  alwaysKnown: false,
  saveAbility: "constitution",
  cost: { kind: "pool", key: "focus", base: 2 },
  effect: {
    effectType: "damage",
    dice: { count: 3, faces: 8, modifier: 0 },
    damageType: "thunder",
    attackType: "save",
    saveAbility: "constitution",
    saveEffect: "half",
    scaling: { mode: "focus", dicePerStep: 0 },
  },
};

function renderRow(over: Partial<Parameters<typeof DisciplineRow>[0]> = {}) {
  const onCast = vi.fn();
  const onForget = vi.fn();
  const onSwapStart = vi.fn();
  render(
    <RollProvider>
      <ul>
        <DisciplineRow
          entry={ENTRY}
          catalog={FANGS}
          characterLevel={6}
          focusAvailable={4}
          saveDC={13}
          forgettable={false}
          busy={false}
          onCast={onCast}
          onForget={onForget}
          onSwapStart={onSwapStart}
          {...over}
        />
      </ul>
    </RollProvider>,
  );
  return { onCast, onForget, onSwapStart };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("DisciplineRow (#688)", () => {
  it("casts with the selected focus and reports a rolled total", async () => {
    const user = userEvent.setup();
    const { onCast } = renderRow();

    await user.selectOptions(screen.getByRole("combobox", { name: /Focus to spend/ }), "3");
    await user.click(screen.getByRole("button", { name: "Cast" }));

    expect(onCast).toHaveBeenCalledTimes(1);
    const op = onCast.mock.calls[0][0];
    expect(op).toMatchObject({ type: "castDiscipline", disciplineId: "fangs", focusSpent: 3 });
    expect(op.roll).toBeGreaterThan(0); // 3d10 through RollContext
  });

  it("disables Cast below the base cost with the needs-N title", () => {
    const { onCast } = renderRow({ catalog: THUNDERS, focusAvailable: 1 });
    const cast = screen.getByRole("button", { name: "Cast" });
    expect(cast).toBeDisabled();
    expect(cast).toHaveAttribute("title", "Not enough focus (needs 2)");
    expect(onCast).not.toHaveBeenCalled();
  });

  it("hides the focus select for a flat-cost discipline", () => {
    renderRow({ catalog: THUNDERS });
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("shows Swap and confirm-gated Forget only when forgettable", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { onForget, onSwapStart } = renderRow({ forgettable: true });

    await user.click(screen.getByRole("button", { name: "Forget" }));
    expect(confirmSpy).toHaveBeenCalledWith('Forget "Fangs of the Fire Snake"?');
    expect(onForget).not.toHaveBeenCalled(); // declined confirm

    confirmSpy.mockReturnValue(true);
    await user.click(screen.getByRole("button", { name: "Forget" }));
    expect(onForget).toHaveBeenCalledWith("entry-1");

    await user.click(screen.getByRole("button", { name: "Swap" }));
    expect(onSwapStart).toHaveBeenCalledWith("entry-1");
  });

  it("omits Swap/Forget when not forgettable", () => {
    renderRow({ forgettable: false });
    expect(screen.queryByRole("button", { name: "Swap" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Forget" })).not.toBeInTheDocument();
  });

  it("expands to the description with roll and save-DC preview", async () => {
    const user = userEvent.setup();
    renderRow({ catalog: THUNDERS, focusAvailable: 4 });

    // The toggle renders entry.name (the learned entry), not the catalog name.
    const toggle = screen.getByRole("button", { name: /Fangs of the Fire Snake/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Extend reach and deal fire damage.")).toBeInTheDocument();
    expect(screen.getByText(/Rolls 3d8/)).toBeInTheDocument();
    expect(screen.getByText(/save DC 13/)).toBeInTheDocument();
  });
});
