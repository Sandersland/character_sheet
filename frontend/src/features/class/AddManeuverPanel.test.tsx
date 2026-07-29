import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchManeuvers } from "@/api/client";
import AddManeuverPanel from "@/features/class/AddManeuverPanel";
import { renderWithCharacter } from "@/test/renderWithCharacter";
import type { Character } from "@/types/character";

vi.mock("@/api/client", () => ({ fetchManeuvers: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchManeuvers).mockResolvedValue([{ id: "m1", name: "Riposte", description: "riposte" }]);
});

const character = { id: "char-1", rulesEdition: "EDITION_2014" } as unknown as Character;

// The catalog is edition-scoped server-side (#1412), so the picker must ask for
// the OWNING character's edition — the sheet has no ceremony context to inherit
// one from, which is why this panel reads useCurrentCharacter itself. A
// hardcoded edition would typecheck and render identically.
describe("AddManeuverPanel", () => {
  it("fetches the catalog for the owning character's edition on first expand", async () => {
    const user = userEvent.setup();
    renderWithCharacter(
      <AddManeuverPanel knownIds={[]} choiceCount={3} knownCount={0} busy={false} onLearn={vi.fn()} />,
      character,
    );

    expect(fetchManeuvers).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /Learn maneuver/ }));

    await waitFor(() => expect(fetchManeuvers).toHaveBeenCalledWith("EDITION_2014"));
    expect(await screen.findByText("Riposte")).toBeInTheDocument();
  });
});
