import { screen, waitFor } from "@testing-library/react";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchActiveSession, fetchSessionDoorway } from "@/api/client";
import { LiveSessionProvider } from "@/features/session/LiveSessionProvider";
import { TurnStateProvider, useTurnStateContext } from "@/features/session/TurnStateProvider";
import { useLiveRound } from "@/features/session/useLiveRound";
import { renderWithCharacter } from "@/test/renderWithCharacter";
import type { Character, Session, SessionDoorwayState } from "@/types/character";

vi.mock("@/api/client", () => ({
  fetchSessionDoorway: vi.fn(),
  fetchActiveSession: vi.fn(),
  fetchCharacter: vi.fn(),
}));

const mockDoorway = vi.mocked(fetchSessionDoorway);
const mockActive = vi.mocked(fetchActiveSession);

const character = { id: "c1", attacksPerAction: 1, inventory: [] } as unknown as Character;
const fullSession: Session = { id: "s1", campaignId: "camp1", status: "active", startedAt: "x", participants: [] };

function doorway(over: Partial<SessionDoorwayState>, sessionOver = {}): SessionDoorwayState {
  return {
    campaignId: "camp1",
    role: "PLAYER",
    canStart: true,
    kind: "none",
    session: null,
    ...over,
    ...(over.session ? { session: { ...over.session, ...sessionOver } } : {}),
  };
}

function Probe() {
  const turn = useTurnStateContext();
  const round = useLiveRound();
  return (
    <div>
      <span data-testid="turn">{turn ? "present" : "null"}</span>
      <span data-testid="round">{round ?? "-"}</span>
    </div>
  );
}

function renderStack() {
  return renderWithCharacter(
    <LiveSessionProvider characterId="c1">
      <TurnStateProvider>
        <Probe />
      </TurnStateProvider>
    </LiveSessionProvider>,
    character,
  );
}

describe("TurnStateProvider single instance + useLiveRound", () => {
  beforeEach(() => {
    localStorage.clear();
    mockDoorway.mockReset();
    mockActive.mockReset();
  });

  it("has a null turn context and a null round when not joined (server round shows only in preview)", async () => {
    mockDoorway.mockResolvedValue(
      doorway({ kind: "liveNotJoined", session: { id: "s1", status: "active", startedAt: "x", scheduledAt: null, title: null, joined: false, round: 4 } }),
    );
    renderStack();
    // Not joined → turn context null; useLiveRound falls back to the doorway's
    // server round. Both assertions need their own waitFor: "null" is also the
    // pre-fetch value, so the first check alone could pass before the
    // query-backed doorway read has actually landed (#1299).
    await waitFor(() => expect(screen.getByTestId("turn")).toHaveTextContent("null"));
    await waitFor(() => expect(screen.getByTestId("round")).toHaveTextContent("4"));
  });

  it("exposes the LOCAL round from the mounted tracker when joined + in combat", async () => {
    // Seed a persisted in-combat turn state for this session.
    localStorage.setItem("cs:turn:s1", JSON.stringify({ inCombat: true, round: 3 }));
    mockDoorway.mockResolvedValue(
      doorway({ kind: "liveJoined", session: { id: "s1", status: "active", startedAt: "x", scheduledAt: null, title: null, joined: true, round: 99 } }),
    );
    mockActive.mockResolvedValue(fullSession);
    renderStack();
    await waitFor(() => expect(screen.getByTestId("turn")).toHaveTextContent("present"));
    // Local tracker wins over the (stale) doorway round of 99.
    expect(screen.getByTestId("round")).toHaveTextContent("3");
  });

  it("returns a null round when joined but not in combat", async () => {
    mockDoorway.mockResolvedValue(
      doorway({ kind: "liveJoined", session: { id: "s1", status: "active", startedAt: "x", scheduledAt: null, title: null, joined: true, round: null } }),
    );
    mockActive.mockResolvedValue(fullSession);
    renderStack();
    await waitFor(() => expect(screen.getByTestId("turn")).toHaveTextContent("present"));
    expect(screen.getByTestId("round")).toHaveTextContent("-");
  });
});

const SRC_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function findUseTurnStateCallSites(): string[] {
  const hits: string[] = [];
  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules") continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entry.name)) continue;
      if (entry.name === "useTurnState.ts" || entry.name.endsWith(".test.ts") || entry.name.endsWith(".test.tsx")) continue;
      const source = readFileSync(full, "utf8");
      if (/\buseTurnState\(/.test(source)) hits.push(full.slice(SRC_DIR.length + 1));
    }
  }
  walk(SRC_DIR);
  return hits;
}

// PIN (plan §7/§8): useTurnState must be called from exactly one place —
// TurnStateProvider — or a second surface would hydrate the same
// `cs:turn:<sessionId>` localStorage key and silently diverge (last write
// wins). A future "simplification" that calls useTurnState directly now that
// the character is available via useCurrentCharacter() is the regression this
// guards against.
describe("useTurnState exactly-once invariant (#1284 §7)", () => {
  it("has exactly one call site: TurnStateProvider", () => {
    expect(findUseTurnStateCallSites()).toEqual(["features/session/TurnStateProvider.tsx"]);
  });
});
