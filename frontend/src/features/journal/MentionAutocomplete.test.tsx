import { useState } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import MentionAutocomplete from "@/features/journal/MentionAutocomplete";
import { primeCampaignEntities } from "@/hooks/useCampaignEntities";
import * as client from "@/api/client";
import type { CampaignEntity } from "@/types/character";
import { axe } from "@/test/axe";

vi.mock("@/api/client", () => ({
  fetchEntities: vi.fn(),
  createEntity: vi.fn(),
}));

const GOBLIN = "11111111-1111-1111-1111-111111111111";
const SWORD = "22222222-2222-2222-2222-222222222222";
const GATE = "33333333-3333-3333-3333-333333333333";

function entity(partial: Partial<CampaignEntity> & { id: string; name: string }): CampaignEntity {
  return {
    campaignId: "camp-1",
    type: "NPC",
    aliases: [],
    notes: null,
    createdAt: "",
    updatedAt: "",
    ...partial,
  };
}

const ENTITIES: CampaignEntity[] = [
  entity({ id: GOBLIN, name: "Goblin Chief", type: "NPC", aliases: ["Grik"] }),
  entity({ id: SWORD, name: "Sword of Truth", type: "ITEM" }),
  entity({ id: GATE, name: "Baldur's Gate", type: "LOCATION" }),
];

function Harness({
  campaignId,
  initialValue = "",
}: {
  campaignId?: string | null;
  initialValue?: string;
}) {
  const [value, setValue] = useState(initialValue);
  return (
    <MemoryRouter>
      <MentionAutocomplete
        value={value}
        onChange={setValue}
        campaignId={campaignId}
        aria-label="Note body"
      />
      <output data-testid="value">{value}</output>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(client.fetchEntities).mockResolvedValue(ENTITIES);
  // Seed the module cache so entities are present synchronously at mount — keeps
  // the popover deterministic regardless of fetch timing / prior-test state.
  primeCampaignEntities("camp-1", ENTITIES);
});

describe("MentionAutocomplete (#248)", () => {
  it("shows matches for @gob", async () => {
    const user = userEvent.setup();
    render(<Harness campaignId="camp-1" />);
    await user.click(screen.getByLabelText("Note body"));
    await user.type(screen.getByLabelText("Note body"), "@gob");

    expect(await screen.findByRole("option", { name: /Goblin Chief/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Sword of Truth/ })).not.toBeInTheDocument();
  });

  it("filters by a reserved type prefix (@item:)", async () => {
    const user = userEvent.setup();
    render(<Harness campaignId="camp-1" />);
    await user.type(screen.getByLabelText("Note body"), "@item:");

    expect(await screen.findByRole("option", { name: /Sword of Truth/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Goblin Chief/ })).not.toBeInTheDocument();
  });

  it("inserts an @[uuid] token when a match is selected", async () => {
    const user = userEvent.setup();
    render(<Harness campaignId="camp-1" />);
    await user.type(screen.getByLabelText("Note body"), "@gob");

    const option = await screen.findByRole("option", { name: /Goblin Chief/ });
    await user.click(option);

    await waitFor(() =>
      expect(screen.getByTestId("value")).toHaveTextContent(`@[${GOBLIN}]`),
    );
  });

  it("still matches a multiword apostrophe name (Baldur's Ga)", async () => {
    const user = userEvent.setup();
    render(<Harness campaignId="camp-1" />);
    await user.type(screen.getByLabelText("Note body"), "@Baldur's Ga");

    expect(await screen.findByRole("option", { name: /Baldur's Gate/ })).toBeInTheDocument();
  });

  it("offers a create row that calls createEntity for a no-match query", async () => {
    vi.mocked(client.createEntity).mockResolvedValue(
      entity({ id: "44444444-4444-4444-4444-444444444444", name: "Mysterious Stranger" }),
    );
    const user = userEvent.setup();
    render(<Harness campaignId="camp-1" />);
    await user.type(screen.getByLabelText("Note body"), "@Mysterious Stranger");

    const createRow = await screen.findByRole("option", { name: /Create NPC/ });
    await user.click(createRow);

    expect(client.createEntity).toHaveBeenCalledWith("camp-1", {
      type: "NPC",
      name: "Mysterious Stranger",
    });
  });

  it("renders a create/join CTA when there is no campaign", async () => {
    const user = userEvent.setup();
    render(<Harness campaignId={null} />);
    await user.type(screen.getByLabelText("Note body"), "@gob");

    expect(await screen.findByRole("link", { name: /create or join a campaign/i })).toBeInTheDocument();
    expect(client.fetchEntities).not.toHaveBeenCalled();
  });

  it("renders a stored token as an @Name chip, not the raw uuid (#269)", async () => {
    render(<Harness campaignId="camp-1" initialValue={`Met @[${GOBLIN}] today`} />);

    const chip = await screen.findByText("@Goblin Chief");
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveAttribute("data-mention-id", GOBLIN);
    expect(screen.getByLabelText("Note body")).not.toHaveTextContent(GOBLIN);
  });

  it("renders an unknown id as literal token text (#269)", async () => {
    const UNKNOWN = "99999999-9999-9999-9999-999999999999";
    render(<Harness campaignId="camp-1" initialValue={`Met @[${UNKNOWN}] today`} />);

    await waitFor(() =>
      expect(screen.getByLabelText("Note body")).toHaveTextContent(`@[${UNKNOWN}]`),
    );
  });

  it("removes a chip with Backspace and serializes the body without it (#269)", async () => {
    render(<Harness campaignId="camp-1" initialValue={`Hi @[${GOBLIN}]`} />);

    const editor = await screen.findByLabelText("Note body");
    const chip = await screen.findByText("@Goblin Chief");
    // Place the caret immediately after the chip, then Backspace deletes it atomically.
    editor.focus();
    const range = document.createRange();
    range.setStartAfter(chip);
    range.collapse(true);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    fireEvent.keyDown(editor, { key: "Backspace" });

    await waitFor(() => expect(screen.getByTestId("value")).not.toHaveTextContent(GOBLIN));
    expect(screen.getByTestId("value")).toHaveTextContent("Hi");
  });

  it("has no axe violations", async () => {
    const { container } = render(<Harness campaignId="camp-1" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
