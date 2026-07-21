import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import MobileSheetHeader from "@/features/character-meta/MobileSheetHeader";
import { RollProvider } from "@/features/dice/RollContext";
import type { Character } from "@/types/character";

// The switcher sheet fetches the character list on open; keep it inert here.
vi.mock("@/api/client", async (importActual) => ({
  ...(await importActual<typeof import("@/api/client")>()),
  fetchCharacters: vi.fn().mockResolvedValue([]),
}));

function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: "c1",
    name: "Aldric",
    race: "Human",
    class: "Fighter",
    subclass: "Champion",
    level: 7,
    campaignId: "camp1",
    armorClass: 18,
    armorClassBreakdown: [
      { label: "Chain Mail", value: 16 },
      { label: "Shield", value: 2 },
    ],
    initiativeBonus: 2,
    speed: 30,
    proficiencyBonus: 3,
    hitPoints: { current: 44, max: 62, temp: 0, deathSaves: { successes: 0, failures: 0 } },
    ...overrides,
  } as Character;
}

function renderHeader(props: Partial<Parameters<typeof MobileSheetHeader>[0]> = {}) {
  return render(
    <MemoryRouter>
      <RollProvider>
        <MobileSheetHeader
          character={props.character ?? makeCharacter()}
          onOpenCapture={vi.fn()}
          onOpenSessions={vi.fn()}
          onOpenActivity={vi.fn()}
          onOpenDelete={vi.fn()}
          {...props}
        />
      </RollProvider>
    </MemoryRouter>,
  );
}

describe("MobileSheetHeader", () => {
  it("renders the name and 'Race · Class Level' subtitle", () => {
    renderHeader();
    expect(screen.getByText("Aldric")).toBeInTheDocument();
    expect(screen.getByText("Human · Fighter 7")).toBeInTheDocument();
  });

  it("shows the subclass pill when present, else Lvl N", () => {
    renderHeader();
    expect(screen.getByText("Champion")).toBeInTheDocument();

    renderHeader({ character: makeCharacter({ subclass: undefined, level: 4 }) });
    expect(screen.getByText("Lvl 4")).toBeInTheDocument();
  });

  it("for a multiclass character, the pill shows the level (subclass rides in the class line)", () => {
    renderHeader({
      character: makeCharacter({
        level: 8,
        subclass: "Champion",
        classes: [
          { id: "cls-1", name: "Fighter", level: 5 },
          { id: "cls-2", name: "Rogue", level: 3 },
        ],
      }),
    });
    expect(screen.getByText("Human · Fighter 5 / Rogue 3")).toBeInTheDocument();
    expect(screen.getByText("Lvl 8")).toBeInTheDocument();
    expect(screen.queryByText("Champion")).not.toBeInTheDocument();
  });

  it("shows HP numbers and the AC badge, but not the Init/Speed/Prof tiles", () => {
    renderHeader();
    // HP readout (current / max).
    expect(screen.getByText("44")).toBeInTheDocument();
    // AC badge value via its breakdown trigger.
    expect(screen.getByRole("button", { name: /armor class/i })).toBeInTheDocument();
    expect(screen.getByText("18")).toBeInTheDocument();
    // The old vitals tiles are gone (Init/Speed/Prof now live on Overview).
    expect(screen.queryByText("Init")).not.toBeInTheDocument();
    expect(screen.queryByText("Speed")).not.toBeInTheDocument();
    expect(screen.queryByText("Prof")).not.toBeInTheDocument();
  });

  it("no longer renders a session button in the header (moved to the doorway bar)", () => {
    renderHeader();
    expect(screen.queryByRole("button", { name: /session/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /join campaign/i })).not.toBeInTheDocument();
  });

  it("does not render a 'Join campaign' affordance even when the character is in no campaign", () => {
    renderHeader({ character: makeCharacter({ campaignId: undefined }) });
    expect(screen.queryByRole("link", { name: /join campaign/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /join campaign/i })).not.toBeInTheDocument();
  });

  it("adds Leave / End Session to the menu while joined, and fires their handlers", () => {
    const onLeave = vi.fn();
    const onEnd = vi.fn();
    renderHeader({ sessionActions: { busy: false, onLeave, onEnd } });

    // Selecting an item closes the menu, so re-open it between the two clicks.
    fireEvent.click(screen.getByRole("button", { name: /sheet actions/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: "End Session" }));
    expect(onEnd).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: /sheet actions/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Leave Session" }));
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it("disables Leave / End Session while a session action is in flight", () => {
    const onEnd = vi.fn();
    renderHeader({ sessionActions: { busy: true, onLeave: vi.fn(), onEnd } });

    fireEvent.click(screen.getByRole("button", { name: /sheet actions/i }));
    const end = screen.getByRole("menuitem", { name: "End Session" });
    expect(end).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(end);
    expect(onEnd).not.toHaveBeenCalled();
  });

  it("in a solo session (no onLeave) shows End Session but never Leave Session (#1082)", () => {
    const onEnd = vi.fn();
    renderHeader({ sessionActions: { busy: false, onEnd } });

    fireEvent.click(screen.getByRole("button", { name: /sheet actions/i }));
    expect(screen.getByRole("menuitem", { name: "End Session" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Leave Session" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: "End Session" }));
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("shows no Leave / End Session items when not in a live session", () => {
    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: /sheet actions/i }));
    expect(screen.queryByRole("menuitem", { name: "Leave Session" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "End Session" })).not.toBeInTheDocument();
  });

  it("adds 'Campaign settings…' to the overflow menu and fires its handler", () => {
    const onOpenCampaignSettings = vi.fn();
    renderHeader({ onOpenCampaignSettings });
    fireEvent.click(screen.getByRole("button", { name: /sheet actions/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /campaign settings/i }));
    expect(onOpenCampaignSettings).toHaveBeenCalledTimes(1);
  });

  it("omits 'Campaign settings…' when no handler is provided", () => {
    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: /sheet actions/i }));
    expect(screen.queryByRole("menuitem", { name: /campaign settings/i })).not.toBeInTheDocument();
  });

  it("exposes Note / Sessions / Activity / Delete in the overflow menu", () => {
    const onOpenCapture = vi.fn();
    renderHeader({ onOpenCapture });

    fireEvent.click(screen.getByRole("button", { name: /sheet actions/i }));
    expect(screen.getByRole("menuitem", { name: /note/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /sessions/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /activity/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("menuitem", { name: /note/i }));
    expect(onOpenCapture).toHaveBeenCalledTimes(1);
  });
});

// #1026: the live pill replaces the "Session live" banner — shown whenever a
// session is live+joined, carrying round/live state and tapping through to Combat.
describe("MobileSheetHeader live pill (#1026)", () => {
  it("shows a Round pill while live and taps through to Combat", () => {
    const onGoToCombat = vi.fn();
    renderHeader({
      sessionActions: { busy: false, onLeave: vi.fn(), onEnd: vi.fn() },
      liveRound: 3,
      onGoToCombat,
    });
    fireEvent.click(screen.getByRole("button", { name: /round 3/i }));
    expect(onGoToCombat).toHaveBeenCalledTimes(1);
  });

  it("shows 'Live' on the pill when there is no active round", () => {
    renderHeader({
      sessionActions: { busy: false, onLeave: vi.fn(), onEnd: vi.fn() },
      liveRound: null,
      onGoToCombat: vi.fn(),
    });
    expect(screen.getByRole("button", { name: /^live — go to fight$/i })).toBeInTheDocument();
  });

  it("shows no live pill when not in a session", () => {
    renderHeader();
    expect(screen.queryByRole("button", { name: /go to fight/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /round/i })).not.toBeInTheDocument();
  });
});

// #1026: collapse-on-scroll — a `scrolled` sheet collapses the header to a single
// bar (name + HP + pill); the identity remains the switcher trigger (#1027).
describe("MobileSheetHeader collapse-on-scroll (#1026)", () => {
  it("collapses to a single bar once scrolled, hiding the AC badge and subtitle", () => {
    renderHeader({ scrolled: true });
    expect(screen.getByText("Aldric")).toBeInTheDocument();
    expect(screen.queryByText("Human · Fighter 7")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /armor class/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /switch character/i })).toBeInTheDocument();
  });

  it("carries the live pill on the collapsed bar and taps through to Combat", () => {
    const onGoToCombat = vi.fn();
    renderHeader({
      scrolled: true,
      sessionActions: { busy: false, onLeave: vi.fn(), onEnd: vi.fn() },
      liveRound: 2,
      onGoToCombat,
    });
    fireEvent.click(screen.getByRole("button", { name: /round 2/i }));
    expect(onGoToCombat).toHaveBeenCalledTimes(1);
  });

  it("stays the full header when not scrolled", () => {
    renderHeader({ scrolled: false });
    expect(screen.getByText("Human · Fighter 7")).toBeInTheDocument();
  });
});

// #1027: the identity block is the mobile route back out — tapping it opens the
// character switcher sheet in both the expanded and collapsed header states.
describe("MobileSheetHeader character switcher (#1027)", () => {
  it("opens the switcher sheet when the identity is tapped (expanded)", () => {
    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: /switch character/i }));
    expect(screen.getByRole("dialog", { name: /characters/i })).toBeInTheDocument();
  });

  it("opens the switcher sheet from the collapsed bar identity", () => {
    renderHeader({ scrolled: true });
    fireEvent.click(screen.getByRole("button", { name: /switch character/i }));
    expect(screen.getByRole("dialog", { name: /characters/i })).toBeInTheDocument();
  });

  it("adds an 'All characters' item to the overflow menu", () => {
    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: /sheet actions/i }));
    expect(screen.getByRole("menuitem", { name: /all characters/i })).toBeInTheDocument();
  });
});

// #1083: the expanded⇄collapsed swap is animated — the outgoing variant lingers
// as an inert (aria-hidden) crossfading overlay until the height transition (or a
// 250ms fallback) finalizes. Reduced-motion + first mount take the instant swap.
describe("MobileSheetHeader animated collapse (#1083)", () => {
  // Both raw DOM buttons (in-flow + overlay) vs only the accessible ones.
  const allSwitchButtons = (c: HTMLElement) =>
    c.querySelectorAll('button[aria-label="Switch character"]');

  function stubReducedMotion(reduce: boolean) {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: reduce && query.includes("reduce"),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  }

  function renderToggle(scrolled: boolean) {
    const tree = (s: boolean) => (
      <MemoryRouter>
        <RollProvider>
          <MobileSheetHeader
            character={makeCharacter()}
            scrolled={s}
            onOpenCapture={vi.fn()}
            onOpenSessions={vi.fn()}
            onOpenActivity={vi.fn()}
            onOpenDelete={vi.fn()}
          />
        </RollProvider>
      </MemoryRouter>
    );
    const utils = render(tree(scrolled));
    return { ...utils, toggle: (s: boolean) => act(() => utils.rerender(tree(s))) };
  }

  afterEach(() => vi.unstubAllGlobals());

  it("reduced motion: swaps to the collapsed bar instantly, with no overlay", () => {
    stubReducedMotion(true);
    const { container, toggle } = renderToggle(false);
    expect(screen.getByText("Human · Fighter 7")).toBeInTheDocument();
    toggle(true);
    expect(allSwitchButtons(container)).toHaveLength(1);
    expect(screen.queryByText("Human · Fighter 7")).not.toBeInTheDocument();
  });

  describe("with motion allowed (fake timers)", () => {
    beforeEach(() => {
      stubReducedMotion(false);
      vi.useFakeTimers();
    });
    afterEach(() => vi.useRealTimers());

    it("mounts an inert overlay during collapse, then finalizes to just the bar", () => {
      const { container, toggle } = renderToggle(false);
      toggle(true);
      // Both variants are in the DOM (in-flow collapsed + outgoing expanded overlay)…
      expect(allSwitchButtons(container)).toHaveLength(2);
      // …but the overlay is inert/aria-hidden, so only one is accessible.
      expect(screen.getAllByRole("button", { name: /switch character/i })).toHaveLength(1);
      // The outgoing expanded subtitle is still mounted (in the overlay).
      expect(screen.getByText("Human · Fighter 7")).toBeInTheDocument();

      act(() => vi.advanceTimersByTime(260));
      expect(allSwitchButtons(container)).toHaveLength(1);
      expect(screen.queryByText("Human · Fighter 7")).not.toBeInTheDocument();
    });

    it("animates the reverse (expand) the same way, settling on the full header", () => {
      const { container, toggle } = renderToggle(true);
      // First mount collapsed ⇒ no overlay.
      expect(allSwitchButtons(container)).toHaveLength(1);
      toggle(false);
      expect(allSwitchButtons(container)).toHaveLength(2);
      expect(screen.getAllByRole("button", { name: /switch character/i })).toHaveLength(1);

      act(() => vi.advanceTimersByTime(260));
      expect(allSwitchButtons(container)).toHaveLength(1);
      expect(screen.getByText("Human · Fighter 7")).toBeInTheDocument();
    });

    it("first mount while scrolled shows no overlay (instant)", () => {
      const { container } = renderToggle(true);
      expect(allSwitchButtons(container)).toHaveLength(1);
      expect(screen.queryByText("Human · Fighter 7")).not.toBeInTheDocument();
    });

    it("a rapid double-toggle keeps at most one overlay and settles correctly", () => {
      const { container, toggle } = renderToggle(false);
      toggle(true);
      toggle(false);
      // Never more than one outgoing overlay (2 = in-flow + a single overlay).
      expect(allSwitchButtons(container).length).toBeLessThanOrEqual(2);
      act(() => vi.advanceTimersByTime(260));
      expect(allSwitchButtons(container)).toHaveLength(1);
      expect(screen.getByText("Human · Fighter 7")).toBeInTheDocument();
    });
  });
});
