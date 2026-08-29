import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import * as client from "@/api/client";
import SpeciesOriginFeatSection from "@/features/character-create/SpeciesOriginFeatSection";
import type { CreationSpeciesOriginFeatChoice } from "@/lib/characterCreation";
import type { CatalogFeat } from "@/types/character";

vi.mock("@/api/client", () => ({
  fetchFeats: vi.fn().mockResolvedValue([]),
}));

const TOUGH: CatalogFeat = {
  id: "feat-tough",
  name: "Tough",
  description: "Your Hit Point maximum increases.",
  category: "origin",
  abilityOptions: [],
  abilityIncrease: 0,
  improvements: [],
};
const GREAT_WEAPON_FIGHTING: CatalogFeat = {
  id: "feat-gwf",
  name: "Great Weapon Fighting",
  description: "Reroll low damage dice.",
  category: "fighting_style",
  abilityOptions: [],
  abilityIncrease: 0,
  improvements: [],
};

function renderSection(choice: Partial<CreationSpeciesOriginFeatChoice> = {}, onChange = vi.fn()) {
  const fullChoice: CreationSpeciesOriginFeatChoice = { applicable: true, selectedId: "", complete: false, ...choice };
  render(<SpeciesOriginFeatSection choice={fullChoice} edition="EDITION_2024" onChange={onChange} />);
  return { onChange };
}

describe("SpeciesOriginFeatSection (#1690)", () => {
  it("renders nothing when the served spec is inert (applicable:false)", () => {
    const { container } = render(
      <SpeciesOriginFeatSection choice={{ applicable: false, selectedId: "", complete: true }} edition="EDITION_2024" onChange={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("fetches the edition's feat catalog and filters to Origin-category feats only", async () => {
    vi.mocked(client.fetchFeats).mockResolvedValue([TOUGH, GREAT_WEAPON_FIGHTING]);
    renderSection();
    expect(await screen.findByText("Tough")).toBeInTheDocument();
    expect(screen.queryByText("Great Weapon Fighting")).not.toBeInTheDocument();
    expect(client.fetchFeats).toHaveBeenCalledWith("EDITION_2024", undefined);
  });

  it("calls onChange with the feat id when Select is clicked", async () => {
    vi.mocked(client.fetchFeats).mockResolvedValue([TOUGH]);
    const { onChange } = renderSection();
    await screen.findByText("Tough");
    await userEvent.click(screen.getByRole("button", { name: "Select" }));
    expect(onChange).toHaveBeenCalledWith("feat-tough");
  });

  it("shows the selected feat as Selected and toggles it off on a second click", async () => {
    vi.mocked(client.fetchFeats).mockResolvedValue([TOUGH]);
    const { onChange } = renderSection({ selectedId: "feat-tough" });
    await waitFor(() => expect(screen.getByRole("button", { name: "Selected" })).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "Selected" }));
    expect(onChange).toHaveBeenCalledWith("");
  });
});
