// Test helper for anything reading useCurrentCharacter() (#1284). Imports
// render from "@testing-library/react" — the module setup.ts mocks to already
// nest a QueryClientProvider — so composing CurrentCharacterProvider here lands
// inside that provider rather than duplicating it.
//
// Exports are added incrementally, one per commit alongside their first
// consumer (mirrors queryKeys.ts) — an export with no importer yet fails
// fallow's unused-exports gate.
import { render, type RenderOptions } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";

import { getQueryClient } from "@/api/queryClient";
import { characterKeys } from "@/api/queryKeys";
import { CurrentCharacterProvider } from "@/hooks/CurrentCharacterProvider";
import type { Character } from "@/types/character";

/** Reads the character straight back out of the query cache — the assertion
 *  target for "the write reached the cache", once a callback-forwarding
 *  onUpdate is no longer around to spy on. */
export function cachedCharacter(id: string): Character | undefined {
  return getQueryClient().getQueryData<Character>(characterKeys.detail(id));
}

export function renderWithCharacter(
  ui: ReactElement,
  character: Character,
  options?: RenderOptions,
) {
  getQueryClient().setQueryData(characterKeys.detail(character.id), character);
  return render(ui, {
    ...options,
    wrapper: ({ children }: { children: ReactNode }) => (
      <CurrentCharacterProvider id={character.id}>{children}</CurrentCharacterProvider>
    ),
  });
}
