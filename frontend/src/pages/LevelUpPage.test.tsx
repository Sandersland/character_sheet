import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import LevelUpPage from "@/pages/LevelUpPage";
import { useCharacter } from "@/hooks/useCharacter";
import type { Character } from "@/types/character";

vi.mock("@/hooks/useCharacter", () => ({ useCharacter: vi.fn() }));
vi.mock("@/features/level-up/LevelUpCeremony", () => ({
  default: ({ character }: { character: Character }) => <div>CEREMONY:{character.id}</div>,
}));
vi.mock("@/features/character-meta/CharacterLoadError", () => ({
  default: ({ variant }: { variant: string }) => <div>LOAD-ERROR:{variant}</div>,
}));

const useCharacterMock = vi.mocked(useCharacter);

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/characters/c1/level-up"]}>
      <Routes>
        <Route path="/characters/:id/level-up" element={<LevelUpPage />} />
        <Route path="/characters/:id" element={<div>SHEET</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function stub(character: Character | null | undefined, error = false) {
  useCharacterMock.mockReturnValue({ character, error, setCharacter: vi.fn() });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("LevelUpPage", () => {
  it("renders the load-error view on a fetch error", () => {
    stub(undefined, true);
    renderPage();
    expect(screen.getByText("LOAD-ERROR:error")).toBeInTheDocument();
  });

  it("renders nothing while loading (spinner is delay-gated)", () => {
    stub(undefined);
    const { container } = renderPage();
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the not-found view for a missing/forbidden character", () => {
    stub(null);
    renderPage();
    expect(screen.getByText("LOAD-ERROR:not-found")).toBeInTheDocument();
  });

  it("redirects to the sheet when nothing is pending", () => {
    stub({ id: "c1", pendingLevelUps: 0 } as unknown as Character);
    renderPage();
    expect(screen.getByText("SHEET")).toBeInTheDocument();
  });

  it("renders the ceremony when a level-up is pending", () => {
    stub({ id: "c1", pendingLevelUps: 1 } as unknown as Character);
    renderPage();
    expect(screen.getByText("CEREMONY:c1")).toBeInTheDocument();
  });
});
