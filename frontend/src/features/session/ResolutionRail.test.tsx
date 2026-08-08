import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ResolutionRail from "@/features/session/ResolutionRail";
import type { ResolutionView } from "@/features/session/useResolution";
import type { RollResult } from "@/lib/dice";

function baseView(overrides: Partial<ResolutionView> = {}): ResolutionView {
  return {
    source: "Longsword",
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
    onComplete: vi.fn(),
    ...overrides,
  };
}

function attackRoll(total: number): RollResult {
  return { dice: [{ value: total - 5, dropped: false }], modifier: 5, total, spec: { count: 1, faces: 20, modifier: 5 } };
}

describe("ResolutionRail — no-roll shape", () => {
  it("renders no numbered steps, just the Resolve tap", async () => {
    const onComplete = vi.fn();
    render(<ResolutionRail view={baseView({ steps: [], readyToComplete: true, onComplete })} />);

    expect(screen.queryByText("Roll to hit")).not.toBeInTheDocument();
    const button = screen.getByRole("button", { name: "Resolve" });
    await userEvent.click(button);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("hides the completion button once completed", () => {
    render(<ResolutionRail view={baseView({ steps: [], readyToComplete: true, completed: true })} />);
    expect(screen.queryByRole("button", { name: /Resolve|Done/ })).not.toBeInTheDocument();
  });

  it("disables the completion button while the economy slot is unavailable", () => {
    render(<ResolutionRail view={baseView({ steps: [], readyToComplete: true, disabled: true })} />);
    expect(screen.getByRole("button", { name: "Resolve" })).toBeDisabled();
  });
});

describe("ResolutionRail — attack-roll shape", () => {
  const toHit = { bonus: 5, critRange: 20 };

  it("pre-roll: shows the Roll to hit button and no Done affordance", async () => {
    const onRollToHit = vi.fn();
    render(
      <ResolutionRail
        view={baseView({
          steps: [
            { kind: "toHit", state: "active" },
            { kind: "callIt", state: "pending" },
            { kind: "damage", state: "pending" },
          ],
          toHit,
          onRollToHit,
        })}
      />,
    );
    expect(screen.queryByRole("button", { name: "Done" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Roll to hit" }));
    expect(onRollToHit).toHaveBeenCalledTimes(1);
  });

  it("an ambiguous roll shows the DM prompt and wires it Missed / Crit!", async () => {
    const onCallMiss = vi.fn();
    const onCallCrit = vi.fn();
    render(
      <ResolutionRail
        view={baseView({
          steps: [
            { kind: "toHit", state: "done" },
            { kind: "callIt", state: "active" },
            { kind: "damage", state: "active" },
          ],
          toHit,
          toHitRoll: attackRoll(17),
          attack: { total: 17, keptFace: 12, nat20: false, nat1: false, criticalHit: false },
          verdict: undefined,
          onCallMiss,
          onCallCrit,
        })}
      />,
    );
    expect(screen.getAllByText("17").length).toBeGreaterThan(0);
    expect(screen.getByText(/Does/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "it Missed" }));
    expect(onCallMiss).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: "Crit!" }));
    expect(onCallCrit).toHaveBeenCalledTimes(1);
  });

  it("disables it Missed / Crit! while the economy slot is unavailable", () => {
    render(
      <ResolutionRail
        view={baseView({
          steps: [
            { kind: "toHit", state: "done" },
            { kind: "callIt", state: "active" },
            { kind: "damage", state: "active" },
          ],
          toHit,
          toHitRoll: attackRoll(17),
          attack: { total: 17, keptFace: 12, nat20: false, nat1: false, criticalHit: false },
          verdict: undefined,
          disabled: true,
        })}
      />,
    );
    expect(screen.getByRole("button", { name: "it Missed" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Crit!" })).toBeDisabled();
  });

  it("disables the hit-chip's Crit! upgrade button while the economy slot is unavailable", () => {
    render(
      <ResolutionRail
        view={baseView({
          steps: [
            { kind: "toHit", state: "done" },
            { kind: "callIt", state: "done" },
            { kind: "damage", state: "active" },
          ],
          toHit,
          toHitRoll: attackRoll(17),
          attack: { total: 17, keptFace: 12, nat20: false, nat1: false, criticalHit: false },
          verdict: "hit",
          effect: { spec: { count: 1, faces: 8, modifier: 3 }, kind: "damage", damageType: "slashing" },
          disabled: true,
        })}
      />,
    );
    expect(screen.getByRole("button", { name: "Crit!" })).toBeDisabled();
  });

  it("a called hit shows the hit chip, an upgrade button, and arms the damage roll", async () => {
    const onRollEffect = vi.fn();
    render(
      <ResolutionRail
        view={baseView({
          steps: [
            { kind: "toHit", state: "done" },
            { kind: "callIt", state: "done" },
            { kind: "damage", state: "active" },
          ],
          toHit,
          toHitRoll: attackRoll(17),
          attack: { total: 17, keptFace: 12, nat20: false, nat1: false, criticalHit: false },
          verdict: "hit",
          effect: { spec: { count: 1, faces: 8, modifier: 3 }, kind: "damage", damageType: "slashing" },
          onRollEffect,
        })}
      />,
    );
    expect(screen.getByText("✓ Hit")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Roll damage" }));
    expect(onRollEffect).toHaveBeenCalledTimes(1);
  });

  it("a settled miss shows the miss line and no damage button", () => {
    render(
      <ResolutionRail
        view={baseView({
          steps: [
            { kind: "toHit", state: "done" },
            { kind: "callIt", state: "done" },
            { kind: "damage", state: "pending" },
          ],
          toHit,
          toHitRoll: attackRoll(2),
          attack: { total: 2, keptFace: 2, nat20: false, nat1: false, criticalHit: false },
          verdict: "miss",
          effect: { spec: { count: 1, faces: 8, modifier: 3 }, kind: "damage", damageType: "slashing" },
          readyToComplete: true,
        })}
      />,
    );
    expect(screen.getByText("Miss")).toBeInTheDocument();
    expect(screen.getByText("Missed — no damage")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Roll.*damage/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();
  });

  it("a crit shows the crit-labeled damage button", () => {
    render(
      <ResolutionRail
        view={baseView({
          steps: [
            { kind: "toHit", state: "done" },
            { kind: "callIt", state: "done" },
            { kind: "damage", state: "active" },
          ],
          toHit,
          verdict: "crit",
          isCrit: true,
          effect: { spec: { count: 1, faces: 8, modifier: 3 }, kind: "damage", damageType: "slashing" },
        })}
      />,
    );
    expect(screen.getByRole("button", { name: "Roll crit damage" })).toBeInTheDocument();
  });
});

describe("ResolutionRail — saving-throw shape", () => {
  it("announces the DC through abilityLabel, never a raw key", () => {
    render(
      <ResolutionRail
        view={baseView({
          steps: [
            { kind: "announceSave", state: "done" },
            { kind: "damage", state: "active" },
          ],
          save: { dc: 13, ability: "dexterity" },
          effect: { spec: { count: 1, faces: 8, modifier: 0 }, kind: "damage", damageType: "radiant" },
        })}
      />,
    );
    expect(screen.getByText("13")).toBeInTheDocument();
    expect(screen.getByText(/Dexterity save/)).toBeInTheDocument();
    expect(screen.queryByText(/dexterity save/)).not.toBeInTheDocument();
  });
});

describe("ResolutionRail — auto-hit shape", () => {
  it("renders a single damage step with no to-hit or call-it rail entries", () => {
    render(
      <ResolutionRail
        view={baseView({
          steps: [{ kind: "damage", state: "active" }],
          effect: { spec: { count: 3, faces: 4, modifier: 3 }, kind: "damage", damageType: "force" },
        })}
      />,
    );
    expect(screen.queryByText("Roll to hit")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Roll damage" })).toBeInTheDocument();
  });
});
