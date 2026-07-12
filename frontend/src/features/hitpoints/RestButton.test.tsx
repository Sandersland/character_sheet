import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import RestButton from "@/features/hitpoints/RestButton";
import { axe } from "@/test/axe";
import * as client from "@/api/client";
import type { Character } from "@/types/character";

vi.mock("@/api/client", () => ({
  applyHitPointOperations: vi.fn(),
}));

function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: "char-1",
    hitPoints: { current: 12, max: 22, temp: 0, deathSaves: { successes: 0, failures: 0 } },
    hitDice: { total: 3, die: "d10", spent: 1 },
    abilityScores: {
      strength: 10, dexterity: 10, constitution: 14,
      intelligence: 10, wisdom: 10, charisma: 10,
    },
    ...overrides,
  } as unknown as Character;
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.mocked(client.applyHitPointOperations).mockResolvedValue({
    character: makeCharacter(),
    concentrationChecks: [],
  });
});

describe("RestButton (#814)", () => {
  it("renders a compact Rest button with no sheet until tapped", () => {
    render(<RestButton character={makeCharacter()} onUpdate={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Rest" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("tapping opens the Rest sheet with the hit-dice readout", async () => {
    const user = userEvent.setup();
    render(<RestButton character={makeCharacter()} onUpdate={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Rest" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: /rest/i })).toBeInTheDocument();
    // 3 total, 1 spent → 2/3d10 available.
    expect(within(dialog).getByText(/2\/3d10/)).toBeInTheDocument();
  });

  it("a short rest spends a hit die with client-side rolls", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(<RestButton character={makeCharacter()} onUpdate={onUpdate} />);

    await user.click(screen.getByRole("button", { name: "Rest" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Rest" }));

    const [id, ops] = vi.mocked(client.applyHitPointOperations).mock.calls[0];
    expect(id).toBe("char-1");
    expect(ops[0]).toMatchObject({ type: "shortRest" });
    expect((ops[0] as { rolls: number[] }).rolls).toHaveLength(1);
    expect(onUpdate).toHaveBeenCalled();
  });

  it("a long rest submits a longRest op", async () => {
    const user = userEvent.setup();
    render(<RestButton character={makeCharacter()} onUpdate={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Rest" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: /full rest/i }));

    const [, ops] = vi.mocked(client.applyHitPointOperations).mock.calls[0];
    expect(ops[0]).toEqual({ type: "longRest" });
  });

  it("has no axe violations with the sheet open", async () => {
    const user = userEvent.setup();
    const { container } = render(<RestButton character={makeCharacter()} onUpdate={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Rest" }));
    await screen.findByRole("dialog");
    expect(await axe(container)).toHaveNoViolations();
  });
});
