import { afterEach, describe, expect, it, vi } from "vitest";

import {
  applyHitPointOperations,
  applyInventoryTransactions,
  checkHealth,
  createCampaign,
  createCharacter,
  deleteCampaignItem,
  deleteCharacter,
  fetchCampaigns,
  fetchCharacter,
  fetchCharacters,
  fetchItems,
  fetchLevelUpPlan,
  fetchReference,
  joinSession,
  submitLevelUp,
  updateCharacter,
} from "./client";
import type {
  CreateCharacterInput,
  HitPointOperation,
  InventoryOperation,
  LevelUpSubmission,
} from "../types/character";

describe("checkHealth", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns true when the backend responds ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: "ok" }),
      })
    );

    await expect(checkHealth()).resolves.toBe(true);
  });

  it("returns false when the backend is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));

    await expect(checkHealth()).resolves.toBe(false);
  });
});

describe("fetchCharacters", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the parsed list on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          { id: "1", name: "Brielle", race: "Half-Elf", class: "Wizard", level: 7 },
        ],
      })
    );

    await expect(fetchCharacters()).resolves.toHaveLength(1);
  });

  it("throws on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    await expect(fetchCharacters()).rejects.toThrow();
  });
});

describe("fetchCharacter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns null for a 404", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    await expect(fetchCharacter("missing")).resolves.toBeNull();
  });

  it("returns null for a 403 (someone else's character) — graceful not-found, no leak", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 403 }));

    await expect(fetchCharacter("not-mine")).resolves.toBeNull();
  });

  it("throws on other non-ok responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    await expect(fetchCharacter("1")).rejects.toThrow();
  });
});

describe("updateCharacter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends a PATCH with a JSON body and returns the updated character", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "1", currency: { cp: 0, sp: 0, gp: 50, pp: 0 } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await updateCharacter("1", { currency: { cp: 0, sp: 0, gp: 50, pp: 0 } });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/characters/1"),
      expect.objectContaining({ method: "PATCH" })
    );
  });

  it("throws on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 400 }));

    await expect(updateCharacter("1", {})).rejects.toThrow();
  });
});

describe("fetchReference", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the parsed catalog on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          races: [{ id: "r1", name: "Human", speed: 30 }],
          classes: [],
          backgrounds: [],
          alignments: ["Lawful Good"],
        }),
      })
    );

    await expect(fetchReference()).resolves.toMatchObject({
      races: [{ name: "Human", speed: 30 }],
    });
  });

  it("throws on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    await expect(fetchReference()).rejects.toThrow();
  });
});

describe("fetchItems", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the parsed item catalog on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          { id: "i1", name: "Club", category: "weapon", damageDice: "1d4", properties: ["light"] },
        ],
      })
    );

    await expect(fetchItems()).resolves.toMatchObject([{ name: "Club", category: "weapon" }]);
  });

  it("throws on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    await expect(fetchItems()).rejects.toThrow();
  });
});

describe("applyInventoryTransactions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends a POST with the operations batch and returns the updated character", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "1", inventory: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const operations: InventoryOperation[] = [{ type: "acquire", itemId: "item-1", quantity: 1 }];
    await applyInventoryTransactions("1", operations);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/characters/1/inventory/transactions"),
      expect.objectContaining({ method: "POST", body: JSON.stringify({ operations }) })
    );
  });

  it("throws the server's error message on a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: "Not enough currency for this transaction" }),
      })
    );

    await expect(
      applyInventoryTransactions("1", [
        { type: "sell", inventoryItemId: "i1", currencyDelta: { cp: 0, sp: 0, gp: 1, pp: 0 } },
      ])
    ).rejects.toThrow("Not enough currency for this transaction");
  });
});

describe("applyHitPointOperations", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends a POST with the operations batch and returns the updated character", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "1", hitPoints: { current: 15, max: 22, temp: 0, deathSaves: { successes: 0, failures: 0 } } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const operations: HitPointOperation[] = [{ type: "damage", amount: 7 }];
    const result = await applyHitPointOperations("1", operations);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/characters/1/hp"),
      expect.objectContaining({ method: "POST", body: JSON.stringify({ operations }) })
    );
    // Returns the character split apart from concentrationChecks (defaulting to []).
    expect(result.character.id).toBe("1");
    expect(result.concentrationChecks).toEqual([]);
  });

  it("splits out concentrationChecks from the response", async () => {
    const check = {
      spellName: "Bless",
      reason: "damage",
      held: false,
      roll: 4,
      saveBonus: 2,
      total: 6,
      dc: 12,
      damage: 24,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: "1",
          hitPoints: { current: 0, max: 22, temp: 0, deathSaves: { successes: 0, failures: 0 } },
          concentrationChecks: [check],
        }),
      })
    );

    const result = await applyHitPointOperations("1", [{ type: "damage", amount: 24 }]);
    expect(result.character.id).toBe("1");
    expect(
      (result.character as unknown as { concentrationChecks?: unknown }).concentrationChecks
    ).toBeUndefined();
    expect(result.concentrationChecks).toEqual([check]);
  });

  it("throws the server's error message on a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: "No pending level-up: already at level 2" }),
      })
    );

    await expect(
      applyHitPointOperations("1", [{ type: "levelUp", method: "average" }])
    ).rejects.toThrow("No pending level-up: already at level 2");
  });
});

// The generic request<T>/send/throwIfNotOk helpers (#506) are internal — exercised
// here through representative callers to lock the shared ok-check/error-parse/throw flow.
describe("request<T> (json flow, via fetchCampaigns / createCampaign)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the parsed body on a plain GET success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => [{ id: "c1", name: "Curse of Strahd" }] })
    );

    await expect(fetchCampaigns()).resolves.toMatchObject([{ name: "Curse of Strahd" }]);
  });

  it("falls back to the labeled message when a plain GET fails with no JSON error body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => null }));

    await expect(fetchCampaigns()).rejects.toThrow("Failed to fetch campaigns (500)");
  });

  it("surfaces the server's { error } message on a non-ok write", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: "Name already taken" }) })
    );

    await expect(createCampaign("Dupe")).rejects.toThrow("Name already taken");
  });

  it("falls back to the labeled message on a non-ok write with no { error }", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }));

    await expect(createCampaign("Boom")).rejects.toThrow("Failed to create campaign (500)");
  });
});

describe("send (void flow, via deleteCampaignItem / joinSession / deleteCharacter)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves without parsing a body on success (tolerates a 204 with no json)", async () => {
    // No json method on the response — a void helper must NOT read the body.
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await expect(deleteCampaignItem("camp-1", "item-1")).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/campaigns/camp-1/items/item-1"),
      expect.objectContaining({ method: "DELETE" })
    );
  });

  it("surfaces the server's { error } message when a void call fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({ error: "Owner only" }) })
    );

    await expect(joinSession("camp-1", "sess-1", "char-1")).rejects.toThrow("Owner only");
  });

  it("falls back to the labeled message on a void failure with no JSON body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => null }));

    await expect(deleteCharacter("1")).rejects.toThrow("Failed to delete character 1 (500)");
  });
});

describe("fetchLevelUpPlan", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const plan = {
    target: { className: "fighter", subclass: null, newLevel: 3, isPrimary: true },
    steps: [{ kind: "hitPoints" }, { kind: "subclass" }, { kind: "review" }],
  };

  it("GETs /level-up/plan with classEntryId + subclassId query params", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => plan });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchLevelUpPlan("c1", { kind: "existing", classEntryId: "entry-1" }, "sub-1")
    ).resolves.toEqual(plan);

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.pathname).toContain("/characters/c1/level-up/plan");
    expect(url.searchParams.get("classEntryId")).toBe("entry-1");
    expect(url.searchParams.get("subclassId")).toBe("sub-1");
    expect(url.searchParams.get("classId")).toBeNull();
  });

  it("maps a kind:new target to the classId param", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => plan });
    vi.stubGlobal("fetch", fetchMock);

    await fetchLevelUpPlan("c1", { kind: "new", classId: "class-9" });

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.searchParams.get("classId")).toBe("class-9");
    expect(url.searchParams.get("classEntryId")).toBeNull();
    expect(url.searchParams.get("subclassId")).toBeNull();
  });

  it("surfaces the server's { error } message on a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: "Class entry not found: bogus" }),
      })
    );

    await expect(
      fetchLevelUpPlan("c1", { kind: "existing", classEntryId: "bogus" })
    ).rejects.toThrow("Class entry not found: bogus");
  });
});

describe("submitLevelUp", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const submission: LevelUpSubmission = {
    target: { kind: "existing", classEntryId: "entry-1" },
    hp: { method: "average" },
    advancement: { type: "takeAsi", increases: [{ ability: "strength", amount: 2 }] },
  };

  it("POSTs the submission verbatim (NOT wrapped in { operations }) and returns the character", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "c1" }) });
    vi.stubGlobal("fetch", fetchMock);

    await expect(submitLevelUp("c1", submission)).resolves.toMatchObject({ id: "c1" });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/characters/c1/level-up/transactions"),
      expect.objectContaining({ method: "POST", body: JSON.stringify(submission) })
    );
  });

  it("surfaces the server's { error } message on a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: "this level-up requires choosing a subclass" }),
      })
    );

    await expect(submitLevelUp("c1", submission)).rejects.toThrow(
      "this level-up requires choosing a subclass"
    );
  });
});

describe("createCharacter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const input: CreateCharacterInput = {
    name: "New Hero",
    alignment: "Lawful Good",
    race: "Human",
    background: "Soldier",
    classes: [{ name: "Fighter" }],
    abilityScores: {
      strength: 15,
      dexterity: 12,
      constitution: 14,
      intelligence: 8,
      wisdom: 10,
      charisma: 8,
    },
  };

  it("sends a POST with a JSON body and returns the created character", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "new-1", name: "New Hero" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await createCharacter(input);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/characters"),
      expect.objectContaining({ method: "POST", body: JSON.stringify(input) })
    );
  });

  it("throws on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 400 }));

    await expect(createCharacter(input)).rejects.toThrow();
  });
});
