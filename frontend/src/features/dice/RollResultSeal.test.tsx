import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { useEffect, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RollSpec } from "@/lib/dice";
import { useDialogChrome } from "@/hooks/useDialogChrome";
import { RollProvider, useRoll } from "@/features/dice/RollContext";
import RollResultSeal from "@/features/dice/RollResultSeal";

function RollOnMount({ spec, label }: { spec: RollSpec; label: string }) {
  const { roll } = useRoll();
  useEffect(() => {
    roll(spec, label);
  }, [roll, spec, label]);
  return null;
}

function rollWith(faces: number[], spec: RollSpec, label = "Attack") {
  let call = 0;
  vi.spyOn(Math, "random").mockImplementation(() => (faces[call++] - 1) / spec.faces);
  return render(
    <RollProvider>
      <RollOnMount spec={spec} label={label} />
      <RollResultSeal />
    </RollProvider>,
  );
}

describe("RollResultSeal outcome variants", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows both d20s and totals the taken (higher) die under advantage", () => {
    rollWith([7, 18], { count: 1, faces: 20, modifier: 5, mode: "advantage" });

    expect(screen.getByText("Advantage")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument(); // dropped die still visible
    expect(screen.getByText("18")).toBeInTheDocument(); // taken die
    expect(screen.getByText("23")).toBeInTheDocument(); // 18 + 5
  });

  it("marks a natural 20 on the taken die as a critical outcome", () => {
    rollWith([20, 5], { count: 1, faces: 20, mode: "advantage" });

    expect(screen.getByTestId("roll-result-seal")).toHaveAttribute("data-outcome", "critical");
    expect(screen.getByText(/Natural 20 — Critical!/i)).toBeInTheDocument();
  });

  it("does not mark a dropped natural 20 (disadvantage) as critical", () => {
    // disadvantage keeps the lower die (5); the dropped 20 must NOT crit.
    rollWith([20, 5], { count: 1, faces: 20, mode: "disadvantage" });

    expect(screen.getByTestId("roll-result-seal")).toHaveAttribute("data-outcome", "normal");
    expect(screen.queryByText(/Critical/i)).not.toBeInTheDocument();
  });

  it("marks a natural 1 on the taken die as a fumble outcome", () => {
    rollWith([1], { count: 1, faces: 20 });

    expect(screen.getByTestId("roll-result-seal")).toHaveAttribute("data-outcome", "fumble");
    expect(screen.getByText(/Natural 1 — Fumble/i)).toBeInTheDocument();
  });

  it("renders an ordinary outcome with no crit/fumble marking", () => {
    rollWith([12], { count: 1, faces: 20, modifier: 3 });

    expect(screen.getByTestId("roll-result-seal")).toHaveAttribute("data-outcome", "normal");
    expect(screen.getByText("15")).toBeInTheDocument();
  });
});

function DialogHost() {
  const panelRef = useDialogChrome(() => {});
  return <div ref={panelRef} tabIndex={-1} />;
}

function SealHarness() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { roll } = useRoll();
  return (
    <>
      <button type="button" onClick={() => roll({ count: 1, faces: 20, modifier: 5 }, "Initiative")}>
        fire-roll
      </button>
      <button type="button" onClick={() => setDialogOpen(true)}>
        open-dialog
      </button>
      {dialogOpen && <DialogHost />}
      <RollResultSeal />
    </>
  );
}

describe("RollResultSeal (never suppressed / tap-anywhere dismiss)", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows the seal even while a dialog is open (not suppressed)", () => {
    render(
      <RollProvider>
        <SealHarness />
      </RollProvider>,
    );

    fireEvent.click(screen.getByText("open-dialog"));
    fireEvent.click(screen.getByText("fire-roll"));

    expect(screen.getByText("Initiative")).toBeInTheDocument();
  });

  it("dismisses on a pointer-down anywhere on the scrim", () => {
    render(
      <RollProvider>
        <SealHarness />
      </RollProvider>,
    );

    fireEvent.click(screen.getByText("fire-roll"));
    expect(screen.getByText("Initiative")).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByTestId("roll-result-seal"));
    expect(screen.queryByText("Initiative")).not.toBeInTheDocument();
  });

  it("auto-dismisses after the linger so it never traps interaction", () => {
    vi.useFakeTimers();
    try {
      render(
        <RollProvider>
          <SealHarness />
        </RollProvider>,
      );

      act(() => {
        fireEvent.click(screen.getByText("fire-roll"));
      });
      expect(screen.getByTestId("roll-result-seal")).toBeInTheDocument();

      // The scrim intercepts pointer events, so it must clear itself — a roll
      // must not block the next tap/roll indefinitely.
      act(() => {
        vi.advanceTimersByTime(2200);
      });
      expect(screen.queryByTestId("roll-result-seal")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
