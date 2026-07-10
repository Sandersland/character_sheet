import { describe, expect, it } from "vitest";

import { extractEntityIds, normalizeForMatch } from "@/lib/campaign/journal-refs.js";

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";

describe("extractEntityIds", () => {
  it("extracts a single token", () => {
    expect(extractEntityIds(`Met @[${A}] today`)).toEqual([A]);
  });

  it("extracts multiple tokens in first-seen order", () => {
    expect(extractEntityIds(`@[${B}] and @[${A}]`)).toEqual([B, A]);
  });

  it("dedupes repeated tokens", () => {
    expect(extractEntityIds(`@[${A}] then @[${A}] again`)).toEqual([A]);
  });

  it("ignores malformed tokens", () => {
    expect(extractEntityIds("@[] @[notauuid] bare @foo text")).toEqual([]);
  });

  it("matches a token adjacent to punctuation", () => {
    expect(extractEntityIds(`(@[${A}]), @[${B}]!`)).toEqual([A, B]);
  });

  it("matches inside multiword prose", () => {
    expect(extractEntityIds(`We rode to @[${A}] past the gate`)).toEqual([A]);
  });

  it("lowercases an uppercase uuid", () => {
    expect(extractEntityIds(`@[${A.toUpperCase()}]`)).toEqual([A]);
  });
});

describe("normalizeForMatch", () => {
  it("lowercases, strips diacritics and punctuation, collapses whitespace", () => {
    expect(normalizeForMatch("  Baldur's   Gate!  ")).toBe("baldurs gate");
    expect(normalizeForMatch("Tékéli-li")).toBe("tekeli li");
  });
});
