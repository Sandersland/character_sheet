import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import * as client from "@/api/client";
import { getQueryClient } from "@/api/queryClient";
import { characterKeys } from "@/api/queryKeys";
import PortraitCard from "@/features/character-meta/PortraitCard";
import { cachedCharacter, renderWithCharacter } from "@/test/renderWithCharacter";
import type { Character } from "@/types/character";

vi.mock("@/api/client", () => ({
  uploadCharacterPortrait: vi.fn(),
  deleteCharacterPortrait: vi.fn(),
}));

function makeCharacter(overrides: Partial<Character> = {}): Character {
  return { id: "char-1", name: "Brielle", ...overrides } as Character;
}

const png = () => new File([new Uint8Array(8)], "hero.png", { type: "image/png" });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PortraitCard", () => {
  it("offers Choose image when the character has no portrait", () => {
    renderWithCharacter(<PortraitCard />, makeCharacter());

    expect(screen.getByRole("button", { name: "Choose image" })).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("renders the wire portraitUrl and offers Replace/Remove when set", () => {
    renderWithCharacter(
      <PortraitCard />,
      makeCharacter({ portraitUrl: "/api/characters/char-1/portrait?v=v1" }),
    );

    expect(screen.getByRole("img", { name: "Portrait preview" })).toHaveAttribute(
      "src",
      "/api/characters/char-1/portrait?v=v1",
    );
    expect(screen.getByRole("button", { name: "Replace image" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
  });

  it("uploads a picked file, writes the response to the cache, and invalidates the list", async () => {
    const updated = makeCharacter({ portraitUrl: "/api/characters/char-1/portrait?v=v2" });
    vi.mocked(client.uploadCharacterPortrait).mockResolvedValue(updated);
    const invalidateSpy = vi.spyOn(getQueryClient(), "invalidateQueries");
    renderWithCharacter(<PortraitCard />, makeCharacter());

    const file = png();
    await userEvent.upload(screen.getByLabelText("Portrait"), file);

    await waitFor(() =>
      expect(client.uploadCharacterPortrait).toHaveBeenCalledWith("char-1", file),
    );
    await waitFor(() => expect(cachedCharacter("char-1")?.portraitUrl).toBe(updated.portraitUrl));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: characterKeys.list() });
  });

  it("Remove deletes the portrait, caches the response, and invalidates the list", async () => {
    const cleared = makeCharacter();
    vi.mocked(client.deleteCharacterPortrait).mockResolvedValue(cleared);
    const invalidateSpy = vi.spyOn(getQueryClient(), "invalidateQueries");
    renderWithCharacter(
      <PortraitCard />,
      makeCharacter({ portraitUrl: "/api/characters/char-1/portrait?v=v1" }),
    );

    await userEvent.click(screen.getByRole("button", { name: "Remove" }));

    await waitFor(() =>
      expect(client.deleteCharacterPortrait).toHaveBeenCalledWith("char-1"),
    );
    await waitFor(() => expect(cachedCharacter("char-1")?.portraitUrl).toBeUndefined());
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: characterKeys.list() });
  });

  it("surfaces an upload failure via the control's error slot", async () => {
    vi.mocked(client.uploadCharacterPortrait).mockRejectedValue(new Error("Portrait exceeds the 5 MB limit"));
    renderWithCharacter(<PortraitCard />, makeCharacter());

    await userEvent.upload(screen.getByLabelText("Portrait"), png());

    expect(await screen.findByRole("alert")).toHaveTextContent("Portrait exceeds the 5 MB limit");
  });

  it("disables the actions while a write is in flight", async () => {
    let resolveUpload: (c: Character) => void = () => {};
    vi.mocked(client.uploadCharacterPortrait).mockImplementation(
      () => new Promise<Character>((resolve) => (resolveUpload = resolve)),
    );
    renderWithCharacter(
      <PortraitCard />,
      makeCharacter({ portraitUrl: "/api/characters/char-1/portrait?v=v1" }),
    );

    await userEvent.upload(screen.getByLabelText("Portrait"), png());

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Replace image" })).toBeDisabled(),
    );
    expect(screen.getByRole("button", { name: "Remove" })).toBeDisabled();

    resolveUpload(makeCharacter({ portraitUrl: "/api/characters/char-1/portrait?v=v2" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Replace image" })).toBeEnabled(),
    );
  });
});
