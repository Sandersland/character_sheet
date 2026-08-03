import { afterEach, describe, expect, it, vi } from "vitest";

import {
  applyActionTransactions,
  applyConditionTransactions,
  applyExperienceOperations,
  applyHitPointOperations,
  applyResourceTransactions,
  createCharacter,
  deleteCharacter,
  deleteCharacterPortrait,
  fetchActivity,
  fetchCharacter,
  fetchCharacters,
  revertBatch,
  rollInitiativeTransaction,
  updateCampaignPreferences,
  updateCharacter,
  uploadCharacterPortrait,
} from "@/api/characters";
import type { CreateCharacterInput, HitPointOperation } from "@/types/character";

// Verbatim regression pins from client.test.ts (#1270) — assertions
// unchanged, only the import specifier retargeted.
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

// New direct coverage (#1270) — the remaining characters.ts exports were only
// exercised transitively before the split.
describe("deleteCharacter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends a DELETE", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await deleteCharacter("1");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/characters/1"),
      expect.objectContaining({ method: "DELETE" })
    );
  });
});

describe("updateCampaignPreferences", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends a PATCH to /campaign-preferences and returns the updated character", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "1" }) });
    vi.stubGlobal("fetch", fetchMock);

    await updateCampaignPreferences("1", { shareWithDm: true });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/characters/1/campaign-preferences"),
      expect.objectContaining({ method: "PATCH" })
    );
  });
});

describe("applyExperienceOperations", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends { operations } without a sessionId when none is given", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "1" }) });
    vi.stubGlobal("fetch", fetchMock);

    const operations = [{ type: "award" as const, amount: 100 }];
    await applyExperienceOperations("1", operations);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/characters/1/experience"),
      expect.objectContaining({ body: JSON.stringify({ operations }) })
    );
  });

  it("threads an explicit sessionId when given (retroactive award)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "1" }) });
    vi.stubGlobal("fetch", fetchMock);

    const operations = [{ type: "award" as const, amount: 100 }];
    await applyExperienceOperations("1", operations, "sess-1");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/characters/1/experience"),
      expect.objectContaining({ body: JSON.stringify({ operations, sessionId: "sess-1" }) })
    );
  });
});

describe("fetchActivity", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("GETs the unified activity timeline with no query params by default", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    vi.stubGlobal("fetch", fetchMock);

    await fetchActivity("1");

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.pathname).toMatch(/\/characters\/1\/activity$/);
    expect(url.search).toBe("");
  });

  it("composes category/type/sessionId/entityId/includeFields as query params", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    vi.stubGlobal("fetch", fetchMock);

    await fetchActivity("1", {
      category: "inventory",
      type: "sold",
      sessionId: "sess-1",
      entityId: "item-1",
      includeFields: true,
    });

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.searchParams.get("category")).toBe("inventory");
    expect(url.searchParams.get("type")).toBe("sold");
    expect(url.searchParams.get("sessionId")).toBe("sess-1");
    expect(url.searchParams.get("entityId")).toBe("item-1");
    expect(url.searchParams.get("includeFields")).toBe("1");
  });
});

describe("applyResourceTransactions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends a POST with the operations batch", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "1" }) });
    vi.stubGlobal("fetch", fetchMock);

    const operations = [{ type: "spendResource" as const, key: "superiorityDice", amount: 1 }];
    await applyResourceTransactions("1", operations);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/characters/1/resources/transactions"),
      expect.objectContaining({ method: "POST", body: JSON.stringify({ operations }) })
    );
  });
});

describe("rollInitiativeTransaction", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs a single rollInitiative operation and returns the character plus results", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ id: "1", results: [] }) });
    vi.stubGlobal("fetch", fetchMock);

    await rollInitiativeTransaction("1");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/characters/1/resources/transactions"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ operations: [{ type: "rollInitiative" }] }),
      })
    );
  });
});

describe("applyConditionTransactions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends a POST with the operations batch", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "1" }) });
    vi.stubGlobal("fetch", fetchMock);

    const operations = [{ type: "applyCondition" as const, key: "poisoned" as const }];
    await applyConditionTransactions("1", operations);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/characters/1/conditions/transactions"),
      expect.objectContaining({ method: "POST", body: JSON.stringify({ operations }) })
    );
  });
});

describe("revertBatch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs to /events/:batchId/revert, URI-encoding the batchId", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "1" }) });
    vi.stubGlobal("fetch", fetchMock);

    await revertBatch("1", "batch/with/slashes");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/characters/1/events/batch%2Fwith%2Fslashes/revert"),
      expect.objectContaining({ method: "POST" })
    );
  });

  it("surfaces the server's { error } message on a non-ok response (e.g. not the latest batch)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ error: "Only the most recent batch can be reverted" }),
      })
    );

    await expect(revertBatch("1", "batch-1")).rejects.toThrow(
      "Only the most recent batch can be reverted"
    );
  });
});

describe("uploadCharacterPortrait", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs multipart form data with the file under the `portrait` field", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "1" }) });
    vi.stubGlobal("fetch", fetchMock);

    const file = new File(["png-bytes"], "hero.png", { type: "image/png" });
    const result = await uploadCharacterPortrait("1", file);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/characters/1/portrait"),
      expect.objectContaining({ method: "POST" })
    );
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get("portrait")).toBe(file);
    expect(result.id).toBe("1");
  });

  it("sets NO Content-Type header — the browser must add the multipart boundary itself", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "1" }) });
    vi.stubGlobal("fetch", fetchMock);

    await uploadCharacterPortrait("1", new File(["x"], "x.png", { type: "image/png" }));

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.headers).toBeUndefined();
  });

  it("surfaces the server's { error } message on a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: "Uploaded file is not a decodable image" }),
      })
    );

    await expect(
      uploadCharacterPortrait("1", new File(["x"], "x.png", { type: "image/png" }))
    ).rejects.toThrow("Uploaded file is not a decodable image");
  });
});

describe("deleteCharacterPortrait", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends a DELETE and returns the updated character", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "1" }) });
    vi.stubGlobal("fetch", fetchMock);

    const result = await deleteCharacterPortrait("1");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/characters/1/portrait"),
      expect.objectContaining({ method: "DELETE" })
    );
    expect(result.id).toBe("1");
  });

  it("throws on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    await expect(deleteCharacterPortrait("1")).rejects.toThrow();
  });
});

describe("applyActionTransactions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends a POST with the operations batch and returns the character plus batchId", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ id: "1", batchId: "b1" }) });
    vi.stubGlobal("fetch", fetchMock);

    const operations = [{ type: "executeAction" as const, actionKey: "drinkPotion", inventoryItemId: "i1", roll: 5 }];
    const result = await applyActionTransactions("1", operations);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/characters/1/actions/transactions"),
      expect.objectContaining({ method: "POST", body: JSON.stringify({ operations }) })
    );
    expect(result.batchId).toBe("b1");
  });
});
