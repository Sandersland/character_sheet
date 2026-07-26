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
  // GENUINE RED (plan §3/§8.5): before #1284, only useCombatLifecycle's own
  // onUpdate wrapper bumped the log — a write via ANY other path (e.g. the
  // sheet-header HP mutation) never did. This hook subscribes to the character
  // cache directly, so it bumps for every write regardless of which mutation
  // made it (a deliberate strict superset — see the PR body).
  it("bumps the log when the character cache is written, but not on mount", async () => {
    const bumpLog = vi.fn();
    renderHookWithCharacter(() => useSessionLogBumpOnCharacterWrite(bumpLog), makeCharacter());

    // Mount itself must not count as a write.
    await waitFor(() => expect(bumpLog).not.toHaveBeenCalled());

    act(() => {
      getQueryClient().setQueryData(characterKeys.detail("c1"), makeCharacter({ name: "Aldric the Bold" }));
    });

    await waitFor(() => expect(bumpLog).toHaveBeenCalledTimes(1));
  });

  // Pin: structural sharing keeps the same reference for a no-op write — must
  // not bump for a write that changes nothing.
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
