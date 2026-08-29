import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import * as client from "@/api/client";
import { getQueryClient } from "@/api/queryClient";
import { characterKeys } from "@/api/queryKeys";
import DeleteCharacterModal from "@/features/character-meta/DeleteCharacterModal";
import type { Character, CharacterSummary } from "@/types/character";

const navigateMock = vi.fn();
vi.mock("react-router-dom", () => ({ useNavigate: () => navigateMock }));

vi.mock("@/api/client", () => ({
  deleteCharacter: vi.fn(),
}));

const summaries = (): CharacterSummary[] =>
  [
    { id: "char-1", name: "Gierr" },
    { id: "char-2", name: "Ralrak" },
  ] as CharacterSummary[];

function seedCaches() {
  getQueryClient().setQueryData(characterKeys.list(), summaries());
  getQueryClient().setQueryData(characterKeys.detail("char-1"), {
    id: "char-1",
    name: "Gierr",
  } as Character);
}

function renderModal() {
  return render(
    <DeleteCharacterModal characterId="char-1" characterName="Gierr" onClose={vi.fn()} />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DeleteCharacterModal", () => {
  it("removes the character from the cached list before navigating (#1660)", async () => {
    seedCaches();
    vi.mocked(client.deleteCharacter).mockResolvedValue(undefined);
    renderModal();

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/", { replace: true }));
    expect(client.deleteCharacter).toHaveBeenCalledWith("char-1");
    // Cache is corrected in place, not invalidated — within the 30s staleTime a remount would otherwise serve the stale array.
    expect(getQueryClient().getQueryData(characterKeys.list())).toEqual([
      { id: "char-2", name: "Ralrak" },
    ]);
  });

  it("drops the dead detail cache entry", async () => {
    seedCaches();
    vi.mocked(client.deleteCharacter).mockResolvedValue(undefined);
    renderModal();

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(navigateMock).toHaveBeenCalled());
    expect(getQueryClient().getQueryState(characterKeys.detail("char-1"))).toBeUndefined();
  });

  it("leaves the cache untouched and shows the error when the delete fails", async () => {
    seedCaches();
    vi.mocked(client.deleteCharacter).mockRejectedValue(new Error("boom"));
    renderModal();

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(await screen.findByText("Something went wrong. Please try again.")).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
    expect(getQueryClient().getQueryData(characterKeys.list())).toEqual(summaries());
    expect(getQueryClient().getQueryData(characterKeys.detail("char-1"))).toBeDefined();
  });

  it("closes without deleting on Cancel", async () => {
    const onClose = vi.fn();
    render(
      <DeleteCharacterModal characterId="char-1" characterName="Gierr" onClose={onClose} />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalled();
    expect(client.deleteCharacter).not.toHaveBeenCalled();
  });
});
