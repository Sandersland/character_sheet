import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { updateCharacter } from "@/api/client";
import CurrencyEditor from "@/features/inventory/CurrencyEditor";
import { cachedCharacter } from "@/test/renderWithCharacter";
import type { Character, Currency } from "@/types/character";

vi.mock("@/api/client", () => ({ updateCharacter: vi.fn() }));

function makeCurrency(over: Partial<Currency> = {}): Currency {
  return { cp: 0, sp: 0, gp: 10, pp: 0, ...over };
}

function makeCharacter(over: Partial<Character> = {}): Character {
  return { id: "c1", currency: makeCurrency(), ...over } as unknown as Character;
}

describe("CurrencyEditor", () => {
  // GENUINE RED (plan §0/§2/§9.3): today CurrencyEditor calls updateCharacter()
  // directly and only forwards the result via `onUpdate` — nothing writes the
  // character query cache, so any sibling reading useCurrentCharacter() would
  // never see the new purse until a full reload.
  it("reaches the character cache after a purse edit", async () => {
    const updated = makeCharacter({ currency: makeCurrency({ gp: 42 }) });
    vi.mocked(updateCharacter).mockResolvedValue(updated);

    render(<CurrencyEditor character={makeCharacter()} onUpdate={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /edit purse/i }));
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(cachedCharacter("c1")?.currency.gp).toBe(42));
  });
});
