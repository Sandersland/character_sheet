import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import AddSpellPanel from "@/features/spells/AddSpellPanel";
import * as client from "@/api/client";
import { axe } from "@/test/axe";

vi.mock("@/api/client", () => ({
  fetchSpells: vi.fn(),
}));

const noop = () => {};

describe("AddSpellPanel accessibility", () => {
  beforeEach(() => {
    vi.mocked(client.fetchSpells).mockResolvedValue([]);
  });

  it("labels the catalog search and level filter (no axe violations)", async () => {
    const { container } = render(
      <AddSpellPanel
        onLearn={noop}
        onClose={noop}
        busy={false}
        learnedSpellIds={new Set()}
      />
    );

    expect(await screen.findByLabelText("Search spells")).toBeInTheDocument();
    expect(screen.getByLabelText("Filter by level")).toBeInTheDocument();

    expect(await axe(container)).toHaveNoViolations();
  });
});
