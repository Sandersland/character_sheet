import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import * as client from "@/api/client";
import { getQueryClient } from "@/api/queryClient";
import { characterKeys } from "@/api/queryKeys";
import IdentityCard from "@/features/character-meta/IdentityCard";
import { cachedCharacter, renderWithCharacter } from "@/test/renderWithCharacter";
import type { Character } from "@/types/character";

vi.mock("@/api/client", () => ({
  uploadCharacterPortrait: vi.fn(),
  deleteCharacterPortrait: vi.fn(),
}));

function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: "char-1",
    name: "Brielle",
    background: "",
    alignment: "",
    ...overrides,
  } as unknown as Character;
}

const png = () => new File([new Uint8Array(8)], "hero.png", { type: "image/png" });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("IdentityCard (#927)", () => {
  it("renders the Identity heading and the background + alignment strings", () => {
    renderWithCharacter(
      <IdentityCard />,
      makeCharacter({ background: "Sage", alignment: "Lawful Good" }),
    );
    expect(screen.getByText("Identity")).toBeInTheDocument();
    expect(screen.getByText("Sage")).toBeInTheDocument();
    expect(screen.getByText("Lawful Good")).toBeInTheDocument();
  });

  it("falls back to an em-dash for a blank field", () => {
    renderWithCharacter(<IdentityCard />, makeCharacter({ background: "Sage", alignment: "" }));
    expect(screen.getByText("Sage")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

describe("IdentityCard portrait region", () => {
  it("offers Choose image when the character has no portrait", () => {
    renderWithCharacter(<IdentityCard />, makeCharacter());

    expect(screen.getByRole("button", { name: "Choose image" })).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("renders the wire portraitUrl and offers Replace/Remove when set", () => {
    renderWithCharacter(
      <IdentityCard />,
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
    renderWithCharacter(<IdentityCard />, makeCharacter());

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
      <IdentityCard />,
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
    vi.mocked(client.uploadCharacterPortrait).mockRejectedValue(
      new Error("Portrait exceeds the 5 MB limit"),
    );
    renderWithCharacter(<IdentityCard />, makeCharacter());

    await userEvent.upload(screen.getByLabelText("Portrait"), png());

    expect(await screen.findByRole("alert")).toHaveTextContent("Portrait exceeds the 5 MB limit");
  });

  // Mutations cross-reset (error = upload ?? remove); without it a stale upload error would shadow a later remove failure.
  it("sequential failures show only the LATEST action's error", async () => {
    vi.mocked(client.uploadCharacterPortrait).mockRejectedValue(new Error("upload boom"));
    vi.mocked(client.deleteCharacterPortrait).mockRejectedValue(new Error("remove boom"));
    renderWithCharacter(
      <IdentityCard />,
      makeCharacter({ portraitUrl: "/api/characters/char-1/portrait?v=v1" }),
    );

    await userEvent.upload(screen.getByLabelText("Portrait"), png());
    expect(await screen.findByRole("alert")).toHaveTextContent("upload boom");

    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("remove boom"),
    );
    expect(screen.getByRole("alert")).not.toHaveTextContent("upload boom");

    vi.mocked(client.uploadCharacterPortrait).mockResolvedValue(
      makeCharacter({ portraitUrl: "/api/characters/char-1/portrait?v=v2" }),
    );
    await userEvent.upload(screen.getByLabelText("Portrait"), png());
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });

  it("disables the actions while a write is in flight", async () => {
    let resolveUpload: (c: Character) => void = () => {};
    vi.mocked(client.uploadCharacterPortrait).mockImplementation(
      () => new Promise<Character>((resolve) => (resolveUpload = resolve)),
    );
    renderWithCharacter(
      <IdentityCard />,
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
