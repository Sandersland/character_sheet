import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import InstanceResolutionStrip from "@/features/session/InstanceResolutionStrip";
import type { ResolutionInstanceView, ResolutionView } from "@/features/session/useResolution";
import type { RollResult } from "@/lib/dice";

function roll(total: number): RollResult {
  return { dice: [{ value: total, dropped: false }], modifier: 0, total, spec: { count: 1, faces: 6 } };
}

function baseInstance(overrides: Partial<ResolutionInstanceView> = {}): ResolutionInstanceView {
  return {
    index: 0,
    toHitRoll: null,
    attack: null,
    verdict: undefined,
    isCrit: false,
    effectRoll: null,
    onRollToHit: vi.fn(),
    onCallMiss: vi.fn(),
    onCallCrit: vi.fn(),
    onRollEffect: vi.fn(),
    ...overrides,
  };
}

function baseView(overrides: Partial<ResolutionView> = {}): ResolutionView {
  return {
    source: "Scorching Ray",
    steps: [],
    disabled: false,
    completed: false,
    readyToComplete: false,
    toHit: undefined,
    toHitRoll: null,
    attack: null,
    verdict: undefined,
    isCrit: false,
    attackChip: "",
    attackMode: "normal",
    save: undefined,
    effect: undefined,
    effectRoll: null,
    onRollToHit: vi.fn(),
    onCallMiss: vi.fn(),
    onCallCrit: vi.fn(),
    onRollEffect: vi.fn(),
    boostToHit: vi.fn(),
    onComplete: vi.fn(),
    ...overrides,
  };
}

describe("InstanceResolutionStrip — renders nothing without instances", () => {
  it("returns null when view.instances is absent", () => {
    const { container } = render(<InstanceResolutionStrip view={baseView()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("returns null when view.instances is an empty array", () => {
    const { container } = render(<InstanceResolutionStrip view={baseView({ instances: [] })} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("InstanceResolutionStrip — attack-instanced (roll:'each', e.g. Scorching Ray)", () => {
  const toHit = { bonus: 6, critRange: 20 };

  it("renders one row per instance with a Roll to hit button pre-roll", () => {
    render(
      <InstanceResolutionStrip
        view={baseView({
          toHit,
          instanceRoll: "each",
          instances: [baseInstance({ index: 0 }), baseInstance({ index: 1 }), baseInstance({ index: 2 })],
        })}
      />,
    );
    expect(screen.getByText("Instance 1")).toBeInTheDocument();
    expect(screen.getByText("Instance 2")).toBeInTheDocument();
    expect(screen.getByText("Instance 3")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Roll to hit" })).toHaveLength(3);
  });

  it("wires per-instance Roll to hit to that instance's own handler", async () => {
    const onRollToHit0 = vi.fn();
    const onRollToHit1 = vi.fn();
    render(
      <InstanceResolutionStrip
        view={baseView({
          toHit,
          instanceRoll: "each",
          instances: [
            baseInstance({ index: 0, onRollToHit: onRollToHit0 }),
            baseInstance({ index: 1, onRollToHit: onRollToHit1 }),
          ],
        })}
      />,
    );
    const buttons = screen.getAllByRole("button", { name: "Roll to hit" });
    await userEvent.click(buttons[1]);
    expect(onRollToHit1).toHaveBeenCalledTimes(1);
    expect(onRollToHit0).not.toHaveBeenCalled();
  });

  it("an unresolved rolled instance shows Miss/Crit! call buttons, not the roll-to-hit button", async () => {
    const onCallMiss = vi.fn();
    const onCallCrit = vi.fn();
    render(
      <InstanceResolutionStrip
        view={baseView({
          toHit,
          instanceRoll: "each",
          instances: [baseInstance({ index: 0, toHitRoll: roll(17), onCallMiss, onCallCrit })],
        })}
      />,
    );
    expect(screen.queryByRole("button", { name: "Roll to hit" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Miss" }));
    expect(onCallMiss).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: "Crit!" }));
    expect(onCallCrit).toHaveBeenCalledTimes(1);
  });

  it("an unresolved rolled instance still shows a Roll damage button (implicit hit, #811) alongside the Miss/Crit! call", async () => {
    const onRollEffect = vi.fn();
    render(
      <InstanceResolutionStrip
        view={baseView({
          toHit,
          instanceRoll: "each",
          instances: [baseInstance({ index: 0, toHitRoll: roll(17), onRollEffect })],
        })}
      />,
    );
    expect(screen.getByRole("button", { name: "Miss" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Crit!" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Roll damage" }));
    expect(onRollEffect).toHaveBeenCalledTimes(1);
  });

  it("a called miss shows the muted Missed row and no damage button", () => {
    render(
      <InstanceResolutionStrip
        view={baseView({
          toHit,
          instanceRoll: "each",
          instances: [baseInstance({ index: 0, toHitRoll: roll(2), verdict: "miss" })],
        })}
      />,
    );
    expect(screen.getByText("Miss")).toBeInTheDocument();
    expect(screen.getByText("Missed — no damage")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Roll.*damage/ })).not.toBeInTheDocument();
  });

  it("a called crit shows the crit-labeled damage button and rolled damage renders via AttackResultLine", () => {
    const { rerender } = render(
      <InstanceResolutionStrip
        view={baseView({
          toHit,
          instanceRoll: "each",
          instances: [baseInstance({ index: 0, toHitRoll: roll(20), verdict: "crit", isCrit: true })],
        })}
      />,
    );
    expect(screen.getByRole("button", { name: "Roll crit damage" })).toBeInTheDocument();

    rerender(
      <InstanceResolutionStrip
        view={baseView({
          toHit,
          instanceRoll: "each",
          instances: [
            baseInstance({ index: 0, toHitRoll: roll(20), verdict: "crit", isCrit: true, effectRoll: roll(11) }),
          ],
        })}
      />,
    );
    expect(screen.getAllByText("11").length).toBeGreaterThan(0);
  });

  it("shows the Done button (mirrors ResolutionRail — a non-empty step list) once readyToComplete, wired to view.onComplete", async () => {
    const onComplete = vi.fn();
    render(
      <InstanceResolutionStrip
        completeLabel="Cast"
        view={baseView({
          toHit,
          instanceRoll: "each",
          readyToComplete: true,
          onComplete,
          steps: [{ kind: "damage", state: "done", settled: true }],
          instances: [baseInstance({ index: 0, toHitRoll: roll(2), verdict: "miss" })],
        })}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});

describe("InstanceResolutionStrip — auto-hit instanced (roll:'each', 2024 Magic Missile)", () => {
  it("no toHit rail at all — each row goes straight to a Roll damage button", () => {
    render(
      <InstanceResolutionStrip
        view={baseView({
          toHit: undefined,
          instanceRoll: "each",
          instances: [baseInstance({ index: 0 }), baseInstance({ index: 1 }), baseInstance({ index: 2 })],
        })}
      />,
    );
    expect(screen.queryByRole("button", { name: "Roll to hit" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Roll damage" })).toHaveLength(3);
  });
});

describe("InstanceResolutionStrip — auto-hit instanced (roll:'once', 2014 Magic Missile)", () => {
  it("renders ONE shared roll button, not per-instance ones", () => {
    const onRollEffect = vi.fn();
    render(
      <InstanceResolutionStrip
        view={baseView({
          toHit: undefined,
          instanceRoll: "once",
          onRollEffect,
          instances: [baseInstance({ index: 0 }), baseInstance({ index: 1 }), baseInstance({ index: 2 })],
        })}
      />,
    );
    expect(screen.getByRole("button", { name: "Roll damage — applies to every instance" })).toBeInTheDocument();
  });

  it("once the shared roll lands, every row shows the fanned-out total and a Crit? toggle", () => {
    render(
      <InstanceResolutionStrip
        view={baseView({
          toHit: undefined,
          instanceRoll: "once",
          effectRoll: roll(4),
          instances: [
            baseInstance({ index: 0, effectRoll: roll(4) }),
            baseInstance({ index: 1, effectRoll: roll(4) }),
          ],
        })}
      />,
    );
    expect(screen.getAllByText("4").length).toBeGreaterThanOrEqual(3); // shared-roll row + two instance rows (each renders "4" twice)
    expect(screen.getAllByRole("button", { name: "Crit?" })).toHaveLength(2);
  });

  it("a crit-toggled instance shows a Crit chip instead of the toggle button and its own (doubled) total", () => {
    const onCallCrit = vi.fn();
    render(
      <InstanceResolutionStrip
        view={baseView({
          toHit: undefined,
          instanceRoll: "once",
          effectRoll: roll(4),
          instances: [baseInstance({ index: 0, effectRoll: roll(8), isCrit: true, onCallCrit })],
        })}
      />,
    );
    expect(screen.getByText("Crit")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Crit?" })).not.toBeInTheDocument();
  });
});
