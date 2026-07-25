import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { updateCharacter } from "@/api/client";
import CurrencyEditor from "@/features/inventory/CurrencyEditor";
import { cachedCharacter, renderWithCharacter } from "@/test/renderWithCharacter";
import type { Character, Currency } from "@/types/character";

vi.mock("@/api/client", () => ({ updateCharacter: vi.fn() }));

function makeCurrency(over: Partial<Currency> = {}): Currency {
  return { cp: 0, sp: 0, gp: 10, pp: 0, ...over };
}

function makeCharacter(over: Partial<Character> = {}): Character {
  return { id: "c1", currency: makeCurrency(), ...over } as unknown as Character;
}

describe("CurrencyEditor", () => {
  // Was GENUINE RED pre-#1284 C2 (plan §0/§2/§9.3): CurrencyEditor used to call
  // updateCharacter() directly and only forward the result via a since-deleted
  // update callback prop — nothing wrote the character query cache. Now routed
  // through useCharacterMutation + useCurrentCharacter().setCharacter.
  it("reaches the character cache after a purse edit", async () => {
    const updated = makeCharacter({ currency: makeCurrency({ gp: 42 }) });
    vi.mocked(updateCharacter).mockResolvedValue(updated);

    renderWithCharacter(<CurrencyEditor character={makeCharacter()} />, makeCharacter());

    fireEvent.click(screen.getByRole("button", { name: /edit purse/i }));
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(cachedCharacter("c1")?.currency.gp).toBe(42));
  });
});
