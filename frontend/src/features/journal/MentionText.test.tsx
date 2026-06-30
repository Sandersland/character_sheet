import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import MentionText from "@/features/journal/MentionText";
import type { CampaignEntity } from "@/types/character";
import { axe } from "@/test/axe";

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";

function map(
  entries: [string, Pick<CampaignEntity, "name" | "type">][],
): Map<string, Pick<CampaignEntity, "name" | "type">> {
  return new Map(entries);
}

function renderText(body: string, entities = map([[A, { name: "Goblin Chief", type: "NPC" }]])) {
  return render(
    <MemoryRouter>
      <MentionText body={body} entities={entities} campaignId="camp-1" />
    </MemoryRouter>,
  );
}

describe("MentionText (#248)", () => {
  it("renders a known id as a chip linking to the entity", () => {
    renderText(`Met @[${A}] today`);
    const link = screen.getByRole("link", { name: /Goblin Chief/ });
    expect(link).toHaveAttribute("href", `/campaigns/camp-1/entities/${A}`);
  });

  it("renders an unknown id as literal token text", () => {
    renderText(`Saw @[${B}]`, map([]));
    expect(screen.getByText(`@[${B}]`, { exact: false })).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("renders mixed text and chips", () => {
    renderText(`Before @[${A}] after`);
    expect(screen.getByText(/Before/)).toBeInTheDocument();
    expect(screen.getByText(/after/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Goblin Chief/ })).toBeInTheDocument();
  });

  it("reflects a rename (name resolved from the map at render)", () => {
    const { rerender } = renderText(`@[${A}]`);
    expect(screen.getByText(/Goblin Chief/)).toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <MentionText
          body={`@[${A}]`}
          entities={map([[A, { name: "Goblin Warlord", type: "NPC" }]])}
          campaignId="camp-1"
        />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Goblin Warlord/)).toBeInTheDocument();
    expect(screen.queryByText(/Goblin Chief/)).not.toBeInTheDocument();
  });

  it("has no axe violations", async () => {
    const { container } = renderText(`Met @[${A}] at the gate`);
    expect(await axe(container)).toHaveNoViolations();
  });
});
