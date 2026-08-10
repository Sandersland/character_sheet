import { afterEach, describe, expect, it, vi } from "vitest";

import {
  advanceCombatRound,
  endCombat,
  endSession,
  endSoloSession,
  fetchActiveSession,
  fetchCampaignSessions,
  fetchCombatState,
  fetchSession,
  fetchSessionDoorway,
  fetchSessions,
  joinSession,
  leaveSession,
  logRoll,
  startCampaignSession,
  startCombat,
  startSoloSession,
  updateSessionTitle,
} from "@/api/session";

describe("startCampaignSession", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs { characterId, title } to /campaigns/:id/sessions", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ session: { id: "s1" }, character: { id: "c1" } }) });
    vi.stubGlobal("fetch", fetchMock);

    await startCampaignSession("camp-1", "char-1", "Session 1");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/campaigns/camp-1/sessions"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ characterId: "char-1", title: "Session 1" }),
      })
    );
  });
});

describe("startSoloSession", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs { title } to /characters/:id/sessions", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ session: { id: "s1" }, character: { id: "c1" } }) });
    vi.stubGlobal("fetch", fetchMock);

    await startSoloSession("char-1", "Session 1");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/characters/char-1/sessions"),
      expect.objectContaining({ method: "POST", body: JSON.stringify({ title: "Session 1" }) })
    );
  });
});

describe("endSoloSession", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs to /characters/:id/sessions/:sessionId/end", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ session: { id: "s1" } }) });
    vi.stubGlobal("fetch", fetchMock);

    await endSoloSession("char-1", "s1");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/characters/char-1/sessions/s1/end"),
      expect.objectContaining({ method: "POST" })
    );
  });
});

// Verbatim regression pin from client.test.ts (#1270) — assertions unchanged,
// only the import specifier retargeted. This is the last leg of the "send
// (void flow)" describe: it stayed in client.test.ts through C8-C10 because
// joinSession hadn't moved into a final module yet.
describe("send (void flow, via joinSession)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("surfaces the server's { error } message when a void call fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({ error: "Owner only" }) })
    );

    await expect(joinSession("camp-1", "sess-1", "char-1")).rejects.toThrow("Owner only");
  });
});

describe("joinSession", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs { characterId } to /campaigns/:id/sessions/:sessionId/join", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await joinSession("camp-1", "s1", "char-1");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/campaigns/camp-1/sessions/s1/join"),
      expect.objectContaining({ method: "POST", body: JSON.stringify({ characterId: "char-1" }) })
    );
  });
});

describe("leaveSession", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs { characterId } to /campaigns/:id/sessions/:sessionId/leave", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await leaveSession("camp-1", "s1", "char-1");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/campaigns/camp-1/sessions/s1/leave"),
      expect.objectContaining({ method: "POST", body: JSON.stringify({ characterId: "char-1" }) })
    );
  });
});

describe("endSession", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs to /campaigns/:id/sessions/:sessionId/end", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ session: { id: "s1" } }) });
    vi.stubGlobal("fetch", fetchMock);

    await endSession("camp-1", "s1");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/campaigns/camp-1/sessions/s1/end"),
      expect.objectContaining({ method: "POST" })
    );
  });
});

describe("fetchCampaignSessions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("GETs /campaigns/:id/sessions", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    vi.stubGlobal("fetch", fetchMock);

    await fetchCampaignSessions("camp-1");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/campaigns/camp-1/sessions"),
      expect.anything()
    );
  });
});

describe("fetchSessions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("GETs /characters/:id/sessions", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    vi.stubGlobal("fetch", fetchMock);

    await fetchSessions("char-1");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/characters/char-1/sessions"),
      expect.anything()
    );
  });
});

describe("updateSessionTitle", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("PATCHes /campaigns/:id/sessions/:sessionId with { title }", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "s1" }) });
    vi.stubGlobal("fetch", fetchMock);

    await updateSessionTitle("camp-1", "s1", "Into the Mist");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/campaigns/camp-1/sessions/s1"),
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ title: "Into the Mist" }) })
    );
  });
});

describe("fetchActiveSession", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns null when no session is active", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => null }));

    await expect(fetchActiveSession("char-1")).resolves.toBeNull();
  });
});

describe("fetchSessionDoorway", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("GETs /characters/:id/sessions/doorway", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ campaignId: null }) });
    vi.stubGlobal("fetch", fetchMock);

    await fetchSessionDoorway("char-1");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/characters/char-1/sessions/doorway"),
      expect.anything()
    );
  });
});

describe("fetchSession", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("GETs /characters/:id/sessions/:sessionId with its events", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ id: "s1", events: [] }) });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchSession("char-1", "s1")).resolves.toMatchObject({ id: "s1", events: [] });
  });
});

const combatStateBody = (over: Partial<{ round: number; combatActive: boolean }> = {}) => ({
  round: 1,
  combatActive: true,
  updatedAt: "2026-07-26T00:00:00.000Z",
  spellEconomy: { bonusActionBlockedByActionSpell: false, bonusActionLimitedToCantrips: false, actionLimitedToCantrips: false },
  ...over,
});

describe("startCombat", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs to /combat/start and resolves the server's CombatState (#1030)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => combatStateBody() });
    vi.stubGlobal("fetch", fetchMock);

    await expect(startCombat("char-1", "s1")).resolves.toEqual(combatStateBody());

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/characters/char-1/sessions/s1/combat/start"),
      expect.objectContaining({ method: "POST" })
    );
  });
});

describe("endCombat", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs to /combat/end and resolves the server's CombatState (#1030)", async () => {
    const body = combatStateBody({ round: 0, combatActive: false });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => body });
    vi.stubGlobal("fetch", fetchMock);

    await expect(endCombat("char-1", "s1")).resolves.toEqual(body);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/characters/char-1/sessions/s1/combat/end"),
      expect.objectContaining({ method: "POST" })
    );
  });
});

describe("advanceCombatRound", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs to /combat/round with NO round in the body — the server decides it (#1030)", async () => {
    const body = combatStateBody({ round: 3 });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => body });
    vi.stubGlobal("fetch", fetchMock);

    await expect(advanceCombatRound("char-1", "s1")).resolves.toEqual(body);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(init.body).toBeUndefined();
  });
});

describe("fetchCombatState", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("GETs .../combat and resolves the CombatState (#1030)", async () => {
    const body = combatStateBody({ round: 2 });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => body });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchCombatState("char-1", "s1")).resolves.toEqual(body);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/characters/char-1/sessions/s1/combat"),
      expect.anything(),
    );
  });
});

describe("logRoll", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs the roll payload to /roll", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const payload = { kind: "attack" as const, source: "Longsword", total: 15 };
    await logRoll("char-1", "s1", payload);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/characters/char-1/sessions/s1/roll"),
      expect.objectContaining({ body: JSON.stringify(payload) })
    );
  });
});
