import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useReducer } from "react";
import { describe, expect, it, vi } from "vitest";

import { FEAT_VIEW_INITIAL, featViewReducer } from "@/features/advancement/featView";
import FeatFlow from "@/features/advancement/FeatFlow";
import { useCustomFeatDraft } from "@/features/advancement/useCustomFeatDraft";
import type { FeatCatalog } from "@/features/advancement/useFeatCatalog";
import { axe } from "@/test/axe";
import type { CatalogFeat } from "@/types/character";

const CATALOG: CatalogFeat[] = [
  {
    id: "alert",
    name: "Alert",
    description: "Always on your guard, you gain a +5 bonus to initiative and cannot be surprised while conscious.",
    category: "origin",
    abilityOptions: [],
    abilityIncrease: 0,
    improvements: [],
  },
  {
    id: "actor",
    name: "Actor",
    description: "Skilled at mimicry and dramatics, you have advantage on Deception and Performance checks.",
    category: "general",
    prerequisite: "Charisma 13 or higher",
    abilityOptions: ["charisma"],
    abilityIncrease: 1,
    improvements: [],
  },
  {
    id: "resilient",
    name: "Resilient",
    description: "You gain proficiency in saving throws using the chosen ability.",
    category: "general",
    abilityOptions: ["strength", "dexterity", "constitution"],
    abilityIncrease: 1,
    improvements: [],
  },
];

const SCORES: Record<string, number> = {
  strength: 8,
  dexterity: 12,
  constitution: 16,
  charisma: 10,
};

function stubCatalog(): FeatCatalog {
  return {
    catalog: CATALOG,
    error: null,
    showSpinner: false,
    ensureFetched: vi.fn(),
    filter: (search) =>
      CATALOG.filter((f) => !search || f.name.toLowerCase().includes(search.toLowerCase())),
  };
}

function Harness({ onSubmit }: { onSubmit: () => void }) {
  const [view, dispatchView] = useReducer(featViewReducer, FEAT_VIEW_INITIAL);
  const custom = useCustomFeatDraft();
  return (
    <FeatFlow
      currentScores={SCORES}
      skillNames={["athletics"]}
      busy={false}
      feats={stubCatalog()}
      view={view}
      dispatchView={dispatchView}
      custom={custom}
      onSubmit={onSubmit}
    />
  );
}

function row(name: string): HTMLElement {
  return screen.getByText(name).closest("li")!;
}

describe("FeatFlow — catalog list (frame A)", () => {
  it("shows ability chips on half-feats and none on full feats", () => {
    render(<Harness onSubmit={vi.fn()} />);
    expect(within(row("Actor")).getByText("+1 Cha")).toBeInTheDocument();
    expect(within(row("Resilient")).getByText("+1 Str, Dex or Con")).toBeInTheDocument();
    expect(within(row("Alert")).queryByText(/\+1/)).not.toBeInTheDocument();
  });

  it("drops the literal 'half-feat' label", () => {
    render(<Harness onSubmit={vi.fn()} />);
    expect(screen.queryByText(/half-feat/i)).not.toBeInTheDocument();
  });

  it("renders a prerequisite as 'Requires: …'", () => {
    render(<Harness onSubmit={vi.fn()} />);
    expect(within(row("Actor")).getByText(/Requires: Charisma 13 or higher/)).toBeInTheDocument();
  });

  it("toggles the description clamp via a More/Less button", async () => {
    const user = userEvent.setup();
    render(<Harness onSubmit={vi.fn()} />);
    const alertRow = row("Alert");
    const desc = within(alertRow).getByText(/Always on your guard/);
    const toggle = within(alertRow).getByRole("button", { name: "Show more about Alert" });

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(desc).toHaveClass("line-clamp-2");

    await user.click(toggle);
    expect(within(alertRow).getByRole("button", { name: "Show less about Alert" })).toHaveAttribute("aria-expanded", "true");
    expect(desc).not.toHaveClass("line-clamp-2");

    await user.click(within(alertRow).getByRole("button", { name: "Show less about Alert" }));
    expect(within(alertRow).getByRole("button", { name: "Show more about Alert" })).toHaveAttribute("aria-expanded", "false");
  });

  it("selecting a feat opens the detail view", async () => {
    const user = userEvent.setup();
    render(<Harness onSubmit={vi.fn()} />);
    await user.click(within(row("Alert")).getByRole("button", { name: /select/i }));
    expect(screen.getByRole("button", { name: /back to list/i })).toBeInTheDocument();
  });

  it("pads the scroll container so Select buttons clear the scrollbar", () => {
    render(<Harness onSubmit={vi.fn()} />);
    const list = screen.getByText("Alert").closest("ul")!;
    expect(list.className).toContain("pr-3");
    expect(list.className).toContain("thin-scrollbar");
  });

  it("has no axe violations in the list view", async () => {
    const { container } = render(<Harness onSubmit={vi.fn()} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("FeatFlow — detail / confirm (frame D)", () => {
  async function selectFeat(name: string) {
    const user = userEvent.setup();
    render(<Harness onSubmit={vi.fn()} />);
    await user.click(within(row(name)).getByRole("button", { name: /select/i }));
    return user;
  }

  it("full feat shows no radiogroup and an enabled Take button", async () => {
    await selectFeat("Alert");
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Take Alert" })).toBeEnabled();
  });

  it("shows the chip beside the serif title", async () => {
    await selectFeat("Resilient");
    expect(screen.getByText("+1 Str, Dex or Con")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /back to list/i })).toBeInTheDocument();
  });

  it("multi-option half-feat shows a score-preview radiogroup and gates the Take button", async () => {
    const user = await selectFeat("Resilient");
    const group = screen.getByRole("radiogroup");
    const radios = within(group).getAllByRole("radio");
    expect(radios).toHaveLength(3);
    radios.forEach((r) => expect(r).toHaveAttribute("aria-checked", "false"));

    // Constitution card previews 16 → 17 from currentScores.
    const conRadio = within(group).getByRole("radio", { name: /constitution/i });
    expect(within(conRadio).getByText(/16\s*→\s*17/)).toBeInTheDocument();

    expect(screen.getByRole("button", { name: "Take Resilient" })).toBeDisabled();

    await user.click(conRadio);
    expect(conRadio).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("button", { name: "Take Resilient" })).toBeEnabled();
  });

  it("staging fires onSubmit after choosing an ability", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    await user.click(within(row("Resilient")).getByRole("button", { name: /select/i }));
    await user.click(screen.getByRole("radio", { name: /constitution/i }));
    await user.click(screen.getByRole("button", { name: "Take Resilient" }));
    expect(onSubmit).toHaveBeenCalled();
  });

  it("single-option half-feat auto-applies with no radiogroup", async () => {
    await selectFeat("Actor");
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
    expect(screen.getByText(/\+1 to Charisma will be applied\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Take Actor" })).toBeEnabled();
  });

  it("selects an ability card via the keyboard", async () => {
    const user = await selectFeat("Resilient");
    const conRadio = screen.getByRole("radio", { name: /constitution/i });
    conRadio.focus();
    await user.keyboard(" ");
    expect(conRadio).toHaveAttribute("aria-checked", "true");
  });

  it("has no axe violations in the detail view", async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness onSubmit={vi.fn()} />);
    await user.click(within(row("Resilient")).getByRole("button", { name: /select/i }));
    expect(await axe(container)).toHaveNoViolations();
  });
});
