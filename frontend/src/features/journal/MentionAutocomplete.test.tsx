import { useState } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import MentionAutocomplete from "@/features/journal/MentionAutocomplete";
import {
  primeCampaignEntities,
  __resetCampaignEntitiesCacheForTests,
} from "@/hooks/useCampaignEntities";
import * as client from "@/api/client";
import type { CampaignEntity } from "@/types/character";
import { axe } from "@/test/axe";

vi.mock("@/api/client", () => ({
  fetchEntities: vi.fn(),
  createEntity: vi.fn(),
}));

vi.mock("@/hooks/useCampaignMerges", () => ({
  useCampaignMerges: () => ({ merges: [] }),
  primeCampaignMerges: vi.fn(),
}));

const GOBLIN = "11111111-1111-1111-1111-111111111111";
const SWORD = "22222222-2222-2222-2222-222222222222";
const GATE = "33333333-3333-3333-3333-333333333333";
const SECRET = "55555555-5555-5555-5555-555555555555";

function entity(partial: Partial<CampaignEntity> & { id: string; name: string }): CampaignEntity {
  return {
    campaignId: "camp-1",
    type: "NPC",
    aliases: [],
    notes: null,
    visibility: "REVEALED",
    createdAt: "",
    updatedAt: "",
    ...partial,
  };
}

const ENTITIES: CampaignEntity[] = [
  entity({ id: GOBLIN, name: "Goblin Chief", type: "NPC", aliases: ["Grik"] }),
  entity({ id: SWORD, name: "Sword of Truth", type: "ITEM" }),
  entity({ id: GATE, name: "Baldur's Gate", type: "LOCATION" }),
  entity({ id: SECRET, name: "Goblin Traitor", type: "NPC", visibility: "HIDDEN" }),
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
  // Clear module-level cache/subscribers/inflight FIRST so no prior test's state
  // (a leaked subscriber or a still-inflight fetch) bleeds into this one (#282).
  __resetCampaignEntitiesCacheForTests();
  // Default the fetch to a resolved value so the effect's loadCampaignEntities
  // never calls .finally on `undefined` (vi.fn()'s default return).
  vi.mocked(client.fetchEntities).mockResolvedValue(ENTITIES);
  // Seed the module cache so entities are present synchronously at mount — keeps
  // the popover deterministic regardless of fetch timing / prior-test state.
  primeCampaignEntities("camp-1", ENTITIES);
});

describe("MentionAutocomplete (#248)", () => {
  it("shows matches for @gob", async () => {
    const user = userEvent.setup({ delay: null });
    render(<Harness campaignId="camp-1" />);
    await user.click(screen.getByLabelText("Note body"));
    await user.type(screen.getByLabelText("Note body"), "@gob");

    expect(await screen.findByRole("option", { name: /Goblin Chief/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Sword of Truth/ })).not.toBeInTheDocument();
  });

  it("excludes a hidden entity from mention suggestions (#534)", async () => {
    const user = userEvent.setup({ delay: null });
    render(<Harness campaignId="camp-1" />);
    await user.type(screen.getByLabelText("Note body"), "@gob");

    expect(await screen.findByRole("option", { name: /Goblin Chief/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Goblin Traitor/ })).not.toBeInTheDocument();
  });

  it("filters by a reserved type prefix (@item:)", async () => {
    const user = userEvent.setup({ delay: null });
    render(<Harness campaignId="camp-1" />);
    await user.type(screen.getByLabelText("Note body"), "@item:");

    expect(await screen.findByRole("option", { name: /Sword of Truth/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Goblin Chief/ })).not.toBeInTheDocument();
  });

  it("inserts an @[uuid] token when a match is selected", async () => {
    const user = userEvent.setup({ delay: null });
    render(<Harness campaignId="camp-1" />);
    await user.type(screen.getByLabelText("Note body"), "@gob");

    const option = await screen.findByRole("option", { name: /Goblin Chief/ });
    await user.click(option);

    await waitFor(() =>
      expect(screen.getByTestId("value")).toHaveTextContent(`@[${GOBLIN}]`),
    );
  });

  // Longest typed query in this suite (12 chars through the debounce). Under heavy
  // CPU contention — lefthook runs this suite parallel to the two tsc jobs on
  // pre-push, oversubscribing cores against vitest's own worker pool — the
  // keystroke/debounce/render chain starved and blew vitest's default 5000ms
  // per-test ceiling, flaking the required gate and forcing push retries. Raising
  // findByRole's wait alone can't help (the test-level timeout fires first), so we
  // lift the test timeout to 15s and let findByRole poll up to 12s. Both only
  // spend wall-time on genuine failure, never on the happy path; behaviour is
  // unchanged.
  it("still matches a multiword apostrophe name (Baldur's Ga)", async () => {
    const user = userEvent.setup({ delay: null });
    render(<Harness campaignId="camp-1" />);
    await user.type(screen.getByLabelText("Note body"), "@Baldur's Ga");

    expect(
      await screen.findByRole("option", { name: /Baldur's Gate/ }, { timeout: 12000 }),
    ).toBeInTheDocument();
  }, 15000);

  it("offers a create row that calls createEntity for a no-match query", async () => {
    vi.mocked(client.createEntity).mockResolvedValue(
      entity({ id: "44444444-4444-4444-4444-444444444444", name: "Mysterious Stranger" }),
    );
    const user = userEvent.setup({ delay: null });
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
    const user = userEvent.setup({ delay: null });
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

describe("MentionAutocomplete combobox ARIA (#273)", () => {
  it("wires aria-controls to the listbox and aria-activedescendant to the active option", async () => {
    const user = userEvent.setup({ delay: null });
    render(<Harness campaignId="camp-1" />);
    const editor = screen.getByLabelText("Note body");

    expect(editor).not.toHaveAttribute("aria-controls");
    expect(editor).not.toHaveAttribute("aria-activedescendant");

    await user.type(editor, "@");

    const listbox = await screen.findByRole("listbox");
    expect(editor).toHaveAttribute("aria-controls", listbox.id);

    const options = screen.getAllByRole("option");
    expect(options.length).toBeGreaterThan(1);
    expect(editor).toHaveAttribute("aria-activedescendant", options[0].id);
  });

  it("gives every option a stable, unique id matching aria-activedescendant as the user arrows", async () => {
    const user = userEvent.setup({ delay: null });
    render(<Harness campaignId="camp-1" />);
    const editor = screen.getByLabelText("Note body");
    await user.type(editor, "@");

    await screen.findByRole("listbox");
    const options = screen.getAllByRole("option");
    const ids = options.map((o) => o.id);
    expect(ids.every(Boolean)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);

    expect(editor).toHaveAttribute("aria-activedescendant", ids[0]);
    await user.keyboard("{ArrowDown}");
    expect(editor).toHaveAttribute("aria-activedescendant", ids[1]);
    await user.keyboard("{ArrowUp}");
    expect(editor).toHaveAttribute("aria-activedescendant", ids[0]);
  });
});

describe("MentionAutocomplete caret-after-delete (#273)", () => {
  function caretOffset() {
    const sel = window.getSelection()!;
    return { node: sel.anchorNode, offset: sel.anchorOffset };
  }

  it("places the caret at the chip-start body offset after Backspace", async () => {
    render(<Harness campaignId="camp-1" initialValue={`Hi @[${GOBLIN}]`} />);
    const editor = await screen.findByLabelText("Note body");
    const chip = await screen.findByText("@Goblin Chief");

    editor.focus();
    const range = document.createRange();
    range.setStartAfter(chip);
    range.collapse(true);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    fireEvent.keyDown(editor, { key: "Backspace" });

    await waitFor(() => expect(screen.getByTestId("value")).not.toHaveTextContent(GOBLIN));
    await waitFor(() => {
      const { node, offset } = caretOffset();
      expect(node?.textContent).toBe("Hi ");
      expect(offset).toBe(3);
    });
  });

  it("places the caret at the chip-start body offset after forward Delete", async () => {
    render(<Harness campaignId="camp-1" initialValue={`@[${GOBLIN}] hi`} />);
    const editor = await screen.findByLabelText("Note body");
    const chip = await screen.findByText("@Goblin Chief");

    editor.focus();
    const range = document.createRange();
    range.setStartBefore(chip);
    range.collapse(true);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    fireEvent.keyDown(editor, { key: "Delete" });

    await waitFor(() => expect(screen.getByTestId("value")).not.toHaveTextContent(GOBLIN));
    await waitFor(() => {
      const { node, offset } = caretOffset();
      expect(node?.textContent).toBe(" hi");
      expect(offset).toBe(0);
    });
  });
});
