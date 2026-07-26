import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useCharacterDraft } from "./useCharacterDraft";

const STORAGE_KEY = "character-draft:new";

describe("useCharacterDraft", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("persists updates to localStorage", () => {
    const { result } = renderHook(() => useCharacterDraft());
    act(() => result.current.update({ name: "Aria", race: "Elf" }));

    expect(result.current.draft.name).toBe("Aria");
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    expect(stored.name).toBe("Aria");
    expect(stored.race).toBe("Elf");
  });

  it("rehydrates an existing draft from localStorage", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ name: "Borin", alignment: "Lawful Good" })
    );
    const { result } = renderHook(() => useCharacterDraft());
    expect(result.current.draft.name).toBe("Borin");
    expect(result.current.draft.alignment).toBe("Lawful Good");
  });

  it("clear() wipes the persisted draft and resets state to empty", () => {
    const { result } = renderHook(() => useCharacterDraft());
    act(() => result.current.update({ name: "Aria", race: "Elf" }));
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();

    act(() => result.current.clear());

    expect(result.current.draft.name).toBe("");
    expect(result.current.draft.race).toBe("");
    // After clear, the effect re-persists the now-empty draft; the important
    // guarantee is that no stale values survive.
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    expect(stored.name).toBe("");
    expect(stored.race).toBe("");
  });

  it("rehydrates a legacy draft (no step) to the first step (#1176)", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ name: "Borin" }));
    const { result } = renderHook(() => useCharacterDraft());
    expect(result.current.draft.step).toBe("identity");
  });

  it("round-trips the current step through localStorage (#1176)", () => {
    const { result } = renderHook(() => useCharacterDraft());
    act(() => result.current.update({ step: "equipment" }));
    expect(result.current.draft.step).toBe("equipment");
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}").step).toBe("equipment");
  });

  it("clear() resets the step to identity (#1176)", () => {
    const { result } = renderHook(() => useCharacterDraft());
    act(() => result.current.update({ step: "review" }));
    act(() => result.current.clear());
    expect(result.current.draft.step).toBe("identity");
  });

  // #1286: a fresh draft's rulesEdition is null (not silently defaulted) — this
  // is what makes CreationEntryGate render instead of the ceremony until the
  // gate resolves it.
  it("starts with rulesEdition and campaignId unresolved (null)", () => {
    const { result } = renderHook(() => useCharacterDraft());
    expect(result.current.draft.rulesEdition).toBeNull();
    expect(result.current.draft.campaignId).toBeNull();
  });

  it("clear() resets rulesEdition back to null, re-surfacing the entry gate on Start Over", () => {
    const { result } = renderHook(() => useCharacterDraft());
    act(() => result.current.update({ rulesEdition: "EDITION_2014", campaignId: "camp-1" }));
    expect(result.current.draft.rulesEdition).toBe("EDITION_2014");

    act(() => result.current.clear());
    expect(result.current.draft.rulesEdition).toBeNull();
    expect(result.current.draft.campaignId).toBeNull();
  });

  // #1286: the Review step echoes the campaign by name (not just id), so the
  // gate hands the name straight through rather than making Review re-fetch it.
  it("carries campaignName alongside campaignId, reset to null on clear()", () => {
    const { result } = renderHook(() => useCharacterDraft());
    expect(result.current.draft.campaignName).toBeNull();

    act(() => result.current.update({ campaignId: "camp-1", campaignName: "The Old Rules Table" }));
    expect(result.current.draft.campaignName).toBe("The Old Rules Table");

    act(() => result.current.clear());
    expect(result.current.draft.campaignName).toBeNull();
  });

  // #1286: createdId must be part of the PERSISTED draft, not a hook-local
  // useState — a page refresh keeps the draft (via localStorage) but discards
  // any component state, so this is what lets a retry after a refresh resume
  // the pending create instead of calling createCharacter again.
  it("carries createdId, reset to null on clear()", () => {
    const { result } = renderHook(() => useCharacterDraft());
    expect(result.current.draft.createdId).toBeNull();

    act(() => result.current.update({ createdId: "char-1" }));
    expect(result.current.draft.createdId).toBe("char-1");

    act(() => result.current.clear());
    expect(result.current.draft.createdId).toBeNull();
  });
});
