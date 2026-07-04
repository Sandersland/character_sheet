import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ShadowArtsSection from "@/features/class/ShadowArtsSection";
import * as client from "@/api/client";
import type { CatalogShadowArt, Character } from "@/types/character";

vi.mock("@/api/client", () => ({ fetchShadowArts: vi.fn() }));

const baseEffect = {
  damageType: null,
  attackType: null,
  saveAbility: null,
  saveEffect: null,
  scaling: { mode: "none" as const },
  buffTarget: null,
  buffModifier: null,
};

const CATALOG: CatalogShadowArt[] = [
  {
    id: "darkness",
    name: "Shadow Arts: Darkness",
    description: "Cast darkness.",
    minLevel: 3,
    cost: { kind: "pool", key: "ki", base: 2 },
    effect: { effectType: "utility", concentration: true, ...baseEffect },
  },
  {
    id: "silence",
    name: "Shadow Arts: Silence",
    description: "Cast silence.",
    minLevel: 3,
    cost: { kind: "pool", key: "ki", base: 2 },
    effect: { effectType: "utility", concentration: true, ...baseEffect },
  },
  {
    id: "pwt",
    name: "Shadow Arts: Pass without Trace",
    description: "Cast pass without trace.",
    minLevel: 3,
    cost: { kind: "pool", key: "ki", base: 2 },
    effect: { effectType: "buff", concentration: true, ...baseEffect, buffTarget: "stealth", buffModifier: 10 },
  },
  {
    id: "darkvision",
    name: "Shadow Arts: Darkvision",
    description: "Cast darkvision.",
    minLevel: 3,
    cost: { kind: "pool", key: "ki", base: 2 },
    effect: { effectType: "utility", concentration: false, ...baseEffect },
  },
];

function makeCharacter(kiRemaining: number, concentratingOn: { entryId: string; spellName: string } | null = null): Character {
  return {
    id: "char-1",
    class: "Monk",
    level: 3,
    resources: {
      features: [],
      shadowArtsAvailable: true,
      pools: [{ key: "ki", label: "Ki", total: 3, recharge: "shortRest", used: 3 - kiRemaining, remaining: kiRemaining }],
      maneuversKnown: [],
      disciplinesKnown: [],
      toolProficienciesKnown: [],
    },
    spellcasting: concentratingOn ? { concentratingOn } : undefined,
  } as unknown as Character;
}

function renderSection(character: Character, props: Partial<React.ComponentProps<typeof ShadowArtsSection>> = {}) {
  const onCast = vi.fn();
  render(<ShadowArtsSection character={character} busy={false} onCast={onCast} {...props} />);
  return { onCast };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(client.fetchShadowArts).mockResolvedValue(CATALOG);
});

describe("ShadowArtsSection", () => {
  it("lists the 4 Shadow Arts at a flat 2-ki cost with ki remaining", async () => {
    renderSection(makeCharacter(3));
    await waitFor(() => expect(screen.getByText("Darkness")).toBeInTheDocument());
    expect(screen.getByText("Silence")).toBeInTheDocument();
    expect(screen.getByText("Pass without Trace")).toBeInTheDocument();
    expect(screen.getByText("Darkvision")).toBeInTheDocument();
    // Ki remaining surfaced.
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("casts a Shadow Art as a castShadowArt op", async () => {
    const user = userEvent.setup();
    const { onCast } = renderSection(makeCharacter(3));
    await waitFor(() => expect(screen.getByText("Darkness")).toBeInTheDocument());

    const row = screen.getByText("Darkness").closest("li")!;
    await user.click(within(row).getByRole("button", { name: "Cast" }));

    expect(onCast).toHaveBeenCalledWith({ type: "castShadowArt", shadowArtId: "darkness" });
  });

  it("disables Cast when the character can't afford 2 ki", async () => {
    renderSection(makeCharacter(1));
    await waitFor(() => expect(screen.getByText("Darkness")).toBeInTheDocument());
    const row = screen.getByText("Darkness").closest("li")!;
    expect(within(row).getByRole("button", { name: "Cast" })).toBeDisabled();
  });

  it("shows the +10 Stealth buff chip on Pass without Trace via skillLabel", async () => {
    renderSection(makeCharacter(3));
    await waitFor(() => expect(screen.getByText("Pass without Trace")).toBeInTheDocument());
    const row = screen.getByText("Pass without Trace").closest("li")!;
    expect(within(row).getByText(/\+10 Stealth/)).toBeInTheDocument();
  });

  it("marks concentration Shadow Arts and surfaces the current concentration handoff", async () => {
    // The backend stamps a Shadow Art's concentration entryId with the shadow-art: prefix.
    renderSection(makeCharacter(3, { entryId: "shadow-art:darkness", spellName: "Shadow Arts: Darkness" }));
    await waitFor(() => expect(screen.getByText("Darkness")).toBeInTheDocument());

    // The active-concentration art shows the 'concentrating' badge.
    const darknessRow = screen.getByText("Darkness").closest("li")!;
    expect(within(darknessRow).getByText("concentrating")).toBeInTheDocument();

    // Non-active concentration arts show the static 'conc' badge.
    const silenceRow = screen.getByText("Silence").closest("li")!;
    expect(within(silenceRow).getByText("conc")).toBeInTheDocument();
    // …and warn (before expand) that casting replaces the current concentration.
    expect(within(silenceRow).getByText(/Casting replaces concentration on/)).toBeInTheDocument();

    // Darkvision (no concentration) shows neither badge.
    const dvRow = screen.getByText("Darkvision").closest("li")!;
    expect(within(dvRow).queryByText(/^conc/)).not.toBeInTheDocument();

    // Handoff banner names the current concentration.
    expect(screen.getByText(/Concentrating on/)).toBeInTheDocument();
  });

  it("surfaces a catalog load error", async () => {
    vi.mocked(client.fetchShadowArts).mockRejectedValue(new Error("boom"));
    renderSection(makeCharacter(3));
    await waitFor(() => expect(screen.getByText(/Couldn't load Shadow Arts/)).toBeInTheDocument());
  });
});
