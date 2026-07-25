// Test helper for anything reading useCurrentCharacter() (#1284). Imports
// render/renderHook from "@testing-library/react" — the module setup.ts mocks
// to already nest a QueryClientProvider — so composing CurrentCharacterProvider
// here lands inside that provider rather than duplicating it.
import { render, renderHook, type RenderHookOptions, type RenderOptions } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";

import { getQueryClient } from "@/api/queryClient";
import { characterKeys } from "@/api/queryKeys";
import { CurrentCharacterProvider } from "@/hooks/CurrentCharacterProvider";
import type { Character } from "@/types/character";

/** Writes a character straight into the query cache — the same write path a
 *  mutation's onSuccess uses, so seeding a test matches how the app populates it. */
export function seedCharacter(character: Character): void {
  getQueryClient().setQueryData(characterKeys.detail(character.id), character);
}

/** Reads the cache back — the assertion target for "the write reached the
 *  cache", preferred over a spy on a deleted onUpdate callback. */
export function cachedCharacter(id: string): Character | undefined {
  return getQueryClient().getQueryData<Character>(characterKeys.detail(id));
}

function providerFor(id: string) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <CurrentCharacterProvider id={id}>{children}</CurrentCharacterProvider>;
  };
}

export function renderWithCharacter(
  ui: ReactElement,
  character: Character,
  options?: RenderOptions,
) {
  seedCharacter(character);
  return render(ui, { ...options, wrapper: providerFor(character.id) });
}

export function renderHookWithCharacter<Result, Props>(
  hook: (props: Props) => Result,
  character: Character,
  options?: RenderHookOptions<Props>,
) {
  seedCharacter(character);
  return renderHook(hook, { ...options, wrapper: providerFor(character.id) });
}
