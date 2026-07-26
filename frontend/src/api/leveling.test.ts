import { afterEach, describe, expect, it, vi } from "vitest";

import {
  applyAdvancementTransactions,
  applyClassTransactions,
  fetchLevelUpPlan,
  submitLevelUp,
} from "@/api/leveling";
import type { LevelUpSubmission } from "@/types/character";

// Verbatim regression pins from client.test.ts (#1270) — assertions unchanged,
// only the import specifier retargeted.
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

// New direct coverage (#1270) — previously only exercised transitively.
describe("applyClassTransactions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends a POST with the operations batch", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "1" }) });
    vi.stubGlobal("fetch", fetchMock);

    const operations = [{ type: "setSubclass" as const, subclassId: "sc-1" }];
    await applyClassTransactions("1", operations);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/characters/1/class/transactions"),
      expect.objectContaining({ method: "POST", body: JSON.stringify({ operations }) })
    );
  });
});

describe("applyAdvancementTransactions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends a POST with the operations batch", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "1" }) });
    vi.stubGlobal("fetch", fetchMock);

    const operations = [{ type: "takeFeat" as const, featId: "feat-1" }];
    await applyAdvancementTransactions("1", operations);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/characters/1/advancement/transactions"),
      expect.objectContaining({ method: "POST", body: JSON.stringify({ operations }) })
    );
  });
});
