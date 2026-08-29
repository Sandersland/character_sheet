import { act, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { getQueryClient } from "@/api/queryClient";
import { characterKeys } from "@/api/queryKeys";
import { useSessionLogBumpOnCharacterWrite } from "@/features/session/useSessionLogBumpOnCharacterWrite";
import { renderHookWithCharacter } from "@/test/renderWithCharacter";
import type { Character } from "@/types/character";

function makeCharacter(over: Partial<Character> = {}): Character {
  return { id: "c1", name: "Aldric", ...over } as unknown as Character;
}

describe("useSessionLogBumpOnCharacterWrite", () => {
  it("bumps the log when the character cache is written, but not on mount", async () => {
    const bumpLog = vi.fn();
    renderHookWithCharacter(() => useSessionLogBumpOnCharacterWrite(bumpLog), makeCharacter());

    await waitFor(() => expect(bumpLog).not.toHaveBeenCalled());

    act(() => {
      getQueryClient().setQueryData(characterKeys.detail("c1"), makeCharacter({ name: "Aldric the Bold" }));
    });

    await waitFor(() => expect(bumpLog).toHaveBeenCalledTimes(1));
  });

  it("does not bump for an identical write (structural sharing)", async () => {
    const bumpLog = vi.fn();
    renderHookWithCharacter(() => useSessionLogBumpOnCharacterWrite(bumpLog), makeCharacter());
    await waitFor(() => expect(bumpLog).not.toHaveBeenCalled());

    act(() => {
      getQueryClient().setQueryData(characterKeys.detail("c1"), makeCharacter());
    });

    expect(bumpLog).not.toHaveBeenCalled();
  });
});
