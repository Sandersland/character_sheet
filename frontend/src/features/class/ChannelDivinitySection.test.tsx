import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ChannelDivinitySection from "@/features/class/ChannelDivinitySection";
import * as client from "@/api/client";
import type { CatalogChannelDivinity, Character } from "@/types/character";

vi.mock("@/api/client", () => ({ fetchChannelDivinity: vi.fn() }));

const CATALOG: CatalogChannelDivinity[] = [
  {
    id: "turn-undead",
    name: "Channel Divinity: Turn Undead",
    description: "Undead within 30 ft flee.",
    kind: "announce",
    saveDc: 13,
    saveAbility: "wisdom",
    reminder: "Targets make a wisdom save (DC 13) or are turned for 1 minute.",
  },
  {
    id: "sacred-weapon",
    name: "Channel Divinity: Sacred Weapon",
    description: "Imbue a weapon.",
    kind: "buff",
    saveDc: null,
    saveAbility: null,
    reminder: "+3 to attack rolls with one weapon for 1 minute; sheds bright light.",
  },
];

function makeCharacter(cdRemaining: number): Character {
  return {
    id: "char-1",
    class: "Cleric",
    level: 2,
    resources: {
      features: [],
      pools: [{ key: "channelDivinity", label: "Channel Divinity", total: 1, recharge: "shortRest", used: 1 - cdRemaining, remaining: cdRemaining }],
      maneuversKnown: [],
      toolProficienciesKnown: [],
    },
  } as unknown as Character;
}

function renderSection(character: Character) {
  const onCast = vi.fn();
  render(<ChannelDivinitySection character={character} busy={false} onCast={onCast} />);
  return { onCast };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(client.fetchChannelDivinity).mockResolvedValue(CATALOG);
});

describe("ChannelDivinitySection", () => {
  it("lists the entitled options with charges remaining", async () => {
    renderSection(makeCharacter(1));
    await waitFor(() => expect(screen.getByText("Turn Undead")).toBeInTheDocument());
    expect(screen.getByText("Sacred Weapon")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("shows the save-DC chip on an announce option via abilityLabel", async () => {
    renderSection(makeCharacter(1));
    await waitFor(() => expect(screen.getByText("Turn Undead")).toBeInTheDocument());
    const row = screen.getByText("Turn Undead").closest("li")!;
    expect(within(row).getByText("Wisdom DC 13")).toBeInTheDocument();
  });

  it("channels an option as a castChannelDivinity op", async () => {
    const user = userEvent.setup();
    const { onCast } = renderSection(makeCharacter(1));
    await waitFor(() => expect(screen.getByText("Sacred Weapon")).toBeInTheDocument());
    const row = screen.getByText("Sacred Weapon").closest("li")!;
    await user.click(within(row).getByRole("button", { name: "Channel" }));
    expect(onCast).toHaveBeenCalledWith({ type: "castChannelDivinity", abilityId: "sacred-weapon" });
  });

  it("disables Channel when no charges remain", async () => {
    renderSection(makeCharacter(0));
    await waitFor(() => expect(screen.getByText("Turn Undead")).toBeInTheDocument());
    const row = screen.getByText("Turn Undead").closest("li")!;
    expect(within(row).getByRole("button", { name: "Channel" })).toBeDisabled();
  });

  it("surfaces a catalog load error", async () => {
    vi.mocked(client.fetchChannelDivinity).mockRejectedValue(new Error("boom"));
    renderSection(makeCharacter(1));
    await waitFor(() => expect(screen.getByText(/Couldn't load Channel Divinity/)).toBeInTheDocument());
  });
});
