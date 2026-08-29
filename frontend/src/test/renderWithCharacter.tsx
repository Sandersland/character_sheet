// Imports render/renderHook from @testing-library/react, which the global
// test setup already mocks to nest a QueryClientProvider — composing
// CurrentCharacterProvider here lands inside that provider instead of
// duplicating it.
import { render, renderHook, type RenderHookOptions, type RenderOptions } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";

import { getQueryClient } from "@/api/queryClient";
import { characterKeys } from "@/api/queryKeys";
import { CurrentCharacterProvider } from "@/hooks/CurrentCharacterProvider";
import type { Character } from "@/types/character";

export function cachedCharacter(id: string): Character | undefined {
  return getQueryClient().getQueryData<Character>(characterKeys.detail(id));
}

function seedAndWrap(character: Character) {
  getQueryClient().setQueryData(characterKeys.detail(character.id), character);
  return function Wrapper({ children }: { children: ReactNode }) {
    return <CurrentCharacterProvider id={character.id}>{children}</CurrentCharacterProvider>;
  };
}

export function renderWithCharacter(
  ui: ReactElement,
  character: Character,
  options?: RenderOptions,
) {
  return render(ui, { ...options, wrapper: seedAndWrap(character) });
}

export function renderHookWithCharacter<Result, Props>(
  hook: (props: Props) => Result,
  character: Character,
  options?: RenderHookOptions<Props>,
) {
  return renderHook(hook, { ...options, wrapper: seedAndWrap(character) });
}
