import { afterEach, describe, expect, it, vi } from "vitest";

import {
  applyAbilityTransactions,
  applyChannelDivinityTransactions,
  applyShadowArtsTransactions,
  applyWarriorOfElementsTransactions,
  attemptStunningStrikeTransaction,
  castManeuverTransaction,
  fetchChannelDivinity,
  fetchManeuvers,
  fetchShadowArts,
  fetchSubclassChoiceOptions,
  imposeOpenHandRiderTransaction,
  rollSneakAttackTransaction,
  setQuiveringPalmTransaction,
  triggerQuiveringPalmTransaction,
} from "@/api/abilities";

// Verbatim regression pin from client.test.ts (#1270) — assertions unchanged,
// only the import specifier retargeted. This is the shared seam every other
// test in this file rides on (#1275).
describe("applyAbilityTransactions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs the operations batch to the shared ability endpoint, keyed by ability", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "1" }) });
    vi.stubGlobal("fetch", fetchMock);

    const operations = [{ type: "rollSneakAttack", eligible: true, usedThisTurn: false }];
    await applyAbilityTransactions("1", "sneak-attack", operations, "Failed to roll Sneak Attack");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/characters/1/abilities/sneak-attack/transactions"),
      expect.objectContaining({ method: "POST", body: JSON.stringify({ operations }) })
    );
  });
});

// New direct coverage (#1270) — the twelve named wrappers below were only
// exercised transitively (through component tests) before the split.
describe("applyWarriorOfElementsTransactions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs to the warrior-of-elements ability endpoint and returns { character, results }", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ character: { id: "1" }, results: [] }) });
    vi.stubGlobal("fetch", fetchMock);

    // Elemental Attunement's own toggle moved off this endpoint (#1686) —
    // elementalStrike is a still-live WarriorOfElementsOperation.
    await applyWarriorOfElementsTransactions("1", [{ type: "elementalStrike", damageType: "fire" }]);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/characters/1/abilities/warrior-of-elements/transactions"),
      expect.objectContaining({ method: "POST" })
    );
  });
});

describe("fetchShadowArts", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("GETs the shadow arts catalog with the character's edition in the query", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [{ id: "sa1" }] });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchShadowArts("EDITION_2014")).resolves.toEqual([{ id: "sa1" }]);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/shadow-arts?edition=EDITION_2014"),
      expect.anything(),
    );
  });
});

describe("applyShadowArtsTransactions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs to the shadow-arts ability endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "1" }) });
    vi.stubGlobal("fetch", fetchMock);

    await applyShadowArtsTransactions("1", [{ type: "castShadowArt", shadowArtId: "darkness" }]);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/characters/1/abilities/shadow-arts/transactions"),
      expect.objectContaining({ method: "POST" })
    );
  });
});

describe("fetchChannelDivinity", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("GETs the character's entitled Channel Divinity options", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [{ id: "cd1" }] });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchChannelDivinity("1")).resolves.toEqual([{ id: "cd1" }]);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/characters/1/channel-divinity"),
      expect.anything()
    );
  });
});

describe("applyChannelDivinityTransactions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs to the channel-divinity ability endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "1" }) });
    vi.stubGlobal("fetch", fetchMock);

    await applyChannelDivinityTransactions("1", [{ type: "castChannelDivinity", abilityId: "cd1" }]);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/characters/1/abilities/channel-divinity/transactions"),
      expect.objectContaining({ method: "POST" })
    );
  });
});

describe("fetchManeuvers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("GETs the maneuver catalog with the character's edition in the query", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [{ id: "m1" }] });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchManeuvers("EDITION_2014")).resolves.toEqual([{ id: "m1" }]);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/maneuvers?edition=EDITION_2014"),
      expect.anything(),
    );
  });
});

describe("fetchSubclassChoiceOptions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("GETs the source's option catalog with the character's edition in the query", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ id: "prey1", name: "Colossus Slayer", description: "d", minLevel: 3 }],
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchSubclassChoiceOptions("huntersPrey", "EDITION_2014")).resolves.toEqual([
      { id: "prey1", name: "Colossus Slayer", description: "d", minLevel: 3 },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/subclass-choices/huntersPrey?edition=EDITION_2014"),
      expect.anything(),
    );
  });

  it("surfaces the server's error message", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: "unknown choice source" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchSubclassChoiceOptions("nope", "EDITION_2024")).rejects.toThrow("unknown choice source");
  });
});

describe("castManeuverTransaction", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs to the maneuvers ability endpoint", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ character: { id: "1" }, results: [] }) });
    vi.stubGlobal("fetch", fetchMock);

    await castManeuverTransaction("1", [{ type: "castManeuver", entryId: "trip-attack" }]);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/characters/1/abilities/maneuvers/transactions"),
      expect.objectContaining({ method: "POST" })
    );
  });
});

describe("rollSneakAttackTransaction", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends a single rollSneakAttack operation with the eligibility flags", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ character: { id: "1" }, results: [] }) });
    vi.stubGlobal("fetch", fetchMock);

    await rollSneakAttackTransaction("1", true, false);

    const operations = [{ type: "rollSneakAttack", eligible: true, usedThisTurn: false }];
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/characters/1/abilities/sneak-attack/transactions"),
      expect.objectContaining({ body: JSON.stringify({ operations }) })
    );
  });
});

describe("attemptStunningStrikeTransaction", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends a single attemptStunningStrike operation", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ character: { id: "1" }, results: [] }) });
    vi.stubGlobal("fetch", fetchMock);

    await attemptStunningStrikeTransaction("1", false);

    const operations = [{ type: "attemptStunningStrike", usedThisTurn: false }];
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/characters/1/abilities/stunning-strike/transactions"),
      expect.objectContaining({ body: JSON.stringify({ operations }) })
    );
  });
});

describe("imposeOpenHandRiderTransaction", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends a single imposeOpenHandRider operation with the chosen rider", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ character: { id: "1" }, results: [] }) });
    vi.stubGlobal("fetch", fetchMock);

    await imposeOpenHandRiderTransaction("1", "topple", true);

    const operations = [{ type: "imposeOpenHandRider", rider: "topple", usedThisTurn: true }];
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/characters/1/abilities/open-hand-technique/transactions"),
      expect.objectContaining({ body: JSON.stringify({ operations }) })
    );
  });
});

describe("setQuiveringPalmTransaction", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends a single setQuiveringPalm operation", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ character: { id: "1" }, results: [] }) });
    vi.stubGlobal("fetch", fetchMock);

    await setQuiveringPalmTransaction("1");

    const operations = [{ type: "setQuiveringPalm" }];
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/characters/1/abilities/quivering-palm/transactions"),
      expect.objectContaining({ body: JSON.stringify({ operations }) })
    );
  });
});

describe("triggerQuiveringPalmTransaction", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends a single triggerQuiveringPalm operation with the rolled damage", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ character: { id: "1" }, results: [] }) });
    vi.stubGlobal("fetch", fetchMock);

    await triggerQuiveringPalmTransaction("1", 47);

    const operations = [{ type: "triggerQuiveringPalm", roll: 47 }];
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/characters/1/abilities/quivering-palm/transactions"),
      expect.objectContaining({ body: JSON.stringify({ operations }) })
    );
  });
});
