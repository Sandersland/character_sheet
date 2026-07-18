import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import CharacterSwitcherSheet from "@/features/character-meta/CharacterSwitcherSheet";
import * as client from "@/api/client";
import type { CharacterSummary } from "@/types/character";

vi.mock("@/api/client", () => ({
  fetchCharacters: vi.fn(),
}));

function summary(overrides: Partial<CharacterSummary> = {}): CharacterSummary {
  return { id: "c1", ownerId: "u1", name: "Aldric", race: "Human", class: "Fighter", level: 7, ...overrides };
}

function renderSheet(onClose = vi.fn()) {
  return render(
    <MemoryRouter initialEntries={["/characters/c1"]}>
      <Routes>
        <Route path="/characters/c1" element={<CharacterSwitcherSheet currentId="c1" onClose={onClose} />} />
        <Route path="/characters/:id" element={<div>Sheet for other</div>} />
        <Route path="/characters/new" element={<div>Create character</div>} />
        <Route path="/" element={<div>Character list</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CharacterSwitcherSheet (#1027)", () => {
  it("lists owned characters with a class/level line, current one checked", async () => {
    vi.mocked(client.fetchCharacters).mockResolvedValue([
      summary(),
      summary({ id: "c2", name: "Sylwen", class: "Druid", level: 5 }),
    ]);
    renderSheet();

    expect(await screen.findByText("Aldric")).toBeInTheDocument();
    expect(screen.getByText("Fighter 7")).toBeInTheDocument();
    expect(screen.getByText("Sylwen")).toBeInTheDocument();
    expect(screen.getByText("Druid 5")).toBeInTheDocument();
    // Current row carries aria-current; others do not.
    expect(screen.getByRole("button", { name: /Aldric/ })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("button", { name: /Sylwen/ })).not.toHaveAttribute("aria-current");
  });

  it("navigates to another character's sheet and closes", async () => {
    const onClose = vi.fn();
    vi.mocked(client.fetchCharacters).mockResolvedValue([
      summary(),
      summary({ id: "c2", name: "Sylwen", class: "Druid", level: 5 }),
    ]);
    renderSheet(onClose);

    fireEvent.click(await screen.findByRole("button", { name: /Sylwen/ }));
    expect(onClose).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByText("Sheet for other")).toBeInTheDocument());
  });

  it("tapping the current character just closes without navigating", async () => {
    const onClose = vi.fn();
    vi.mocked(client.fetchCharacters).mockResolvedValue([summary()]);
    renderSheet(onClose);

    fireEvent.click(await screen.findByRole("button", { name: /Aldric/ }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Sheet for other")).not.toBeInTheDocument();
  });

  it("'All characters' goes to the list; 'New character' goes to creation", async () => {
    vi.mocked(client.fetchCharacters).mockResolvedValue([summary()]);
    renderSheet();

    fireEvent.click(await screen.findByRole("button", { name: /All characters/ }));
    await waitFor(() => expect(screen.getByText("Character list")).toBeInTheDocument());
  });

  it("routes 'New character' to the creation flow", async () => {
    vi.mocked(client.fetchCharacters).mockResolvedValue([summary()]);
    renderSheet();

    fireEvent.click(await screen.findByRole("button", { name: /New character/ }));
    await waitFor(() => expect(screen.getByText("Create character")).toBeInTheDocument());
  });
});
