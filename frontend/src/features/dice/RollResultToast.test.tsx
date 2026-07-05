import { render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RollSpec } from "@/lib/dice";
import { RollProvider, useRoll } from "@/features/dice/RollContext";
import RollResultToast from "@/features/dice/RollResultToast";

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
      <RollResultToast />
    </RollProvider>,
  );
}

describe("RollResultToast advantage/disadvantage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows both d20s and totals the taken (higher) die under advantage", () => {
    rollWith([7, 18], { count: 1, faces: 20, modifier: 5, mode: "advantage" });

    expect(screen.getByText("Advantage")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument(); // dropped die still visible
    expect(screen.getByText("18")).toBeInTheDocument(); // taken die
    expect(screen.getByText("23")).toBeInTheDocument(); // 18 + 5
  });

  it("highlights crit on the taken die, not a dropped natural 20", () => {
    // disadvantage: taken die is the lower (5); the dropped 20 must NOT crit.
    rollWith([20, 5], { count: 1, faces: 20, mode: "disadvantage" });

    expect(screen.queryByText(/Critical/i)).not.toBeInTheDocument();
    expect(screen.getByText("Disadvantage")).toBeInTheDocument();
  });

  it("crits when the taken die is a natural 20", () => {
    rollWith([20, 5], { count: 1, faces: 20, mode: "advantage" });

    expect(screen.getByText(/Natural 20 — Critical!/i)).toBeInTheDocument();
  });
});
