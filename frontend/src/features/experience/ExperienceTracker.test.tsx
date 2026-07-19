import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ExperienceTracker from "@/features/experience/ExperienceTracker";
import * as client from "@/api/client";
import type { Character } from "@/types/character";

vi.mock("@/api/client", () => ({
  applyExperienceOperations: vi.fn(),
}));

function makeCharacter(): Character {
  return {
    id: "char-1",
    experiencePoints: 900,
    currentLevelThreshold: 900,
    nextLevelThreshold: 2700,
    level: 3,
  } as unknown as Character;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(client.applyExperienceOperations).mockResolvedValue(makeCharacter());
});

describe("ExperienceTracker (issue #225)", () => {
  it("shows the Level N accessory", () => {
    render(<ExperienceTracker character={makeCharacter()} onUpdate={vi.fn()} />);
    expect(screen.getByText("Level 3")).toBeInTheDocument();
  });

  it("Award XP fires an award op", async () => {
    const user = userEvent.setup();
    render(<ExperienceTracker character={makeCharacter()} onUpdate={vi.fn()} />);

    await user.type(screen.getByRole("spinbutton", { name: /xp to award/i }), "450");
    await user.click(screen.getByRole("button", { name: /award xp/i }));

    const [, ops] = vi.mocked(client.applyExperienceOperations).mock.calls[0];
    expect(ops[0]).toEqual({ type: "award", amount: 450 });
  });

  it("Award XP is disabled until a value is entered", () => {
    render(<ExperienceTracker character={makeCharacter()} onUpdate={vi.fn()} />);
    expect(screen.getByRole("button", { name: /award xp/i })).toBeDisabled();
  });

  it("Set exact total is hidden until toggled, then fires a set op", async () => {
    const user = userEvent.setup();
    render(<ExperienceTracker character={makeCharacter()} onUpdate={vi.fn()} />);

    // Hidden by default.
    expect(
      screen.queryByRole("spinbutton", { name: /exact xp total/i }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /set exact total/i }));

    const field = screen.getByRole("spinbutton", { name: /exact xp total/i });
    await user.clear(field);
    await user.type(field, "1000");
    await user.click(screen.getByRole("button", { name: /^set$/i }));

    const [, ops] = vi.mocked(client.applyExperienceOperations).mock.calls[0];
    expect(ops[0]).toEqual({ type: "set", value: 1000 });
  });

  it("captions the XP remaining to the next level", () => {
    render(<ExperienceTracker character={makeCharacter()} onUpdate={vi.fn()} />);
    // 2700 next − 900 current = 1800 to Level 4.
    expect(screen.getByText(/1,800 XP to Level 4/i)).toBeInTheDocument();
  });

  it("shows Max level and hides the caption at the cap", () => {
    const maxed = { ...makeCharacter(), nextLevelThreshold: null } as unknown as Character;
    render(<ExperienceTracker character={maxed} onUpdate={vi.fn()} />);
    expect(screen.getByText(/max level/i)).toBeInTheDocument();
    expect(screen.queryByText(/XP to Level/i)).not.toBeInTheDocument();
  });
});
