import { describe, expect, it } from "vitest";

import { diffToFields } from "@/lib/activity/events.js";

describe("diffToFields", () => {
  it("returns one entry per changed top-level leaf", () => {
    expect(diffToFields({ hp: 10, gp: 5 }, { hp: 12, gp: 5 })).toEqual([
      { path: "hp", oldValue: 10, newValue: 12 },
    ]);
  });

  it("recurses into nested plain objects, reporting dotted paths", () => {
    expect(
      diffToFields(
        { hitPoints: { current: 10, max: 20 } },
        { hitPoints: { current: 15, max: 20 } },
      ),
    ).toEqual([{ path: "hitPoints.current", oldValue: 10, newValue: 15 }]);
  });

  it("treats arrays as atomic (not diffed element-by-element)", () => {
    expect(diffToFields({ rolls: [1, 2] }, { rolls: [1, 2, 3] })).toEqual([
      { path: "rolls", oldValue: [1, 2], newValue: [1, 2, 3] },
    ]);
  });

  it("normalizes undefined to null on both sides", () => {
    expect(diffToFields({}, { newField: "x" })).toEqual([
      { path: "newField", oldValue: null, newValue: "x" },
    ]);
    expect(diffToFields({ oldField: "x" }, {})).toEqual([
      { path: "oldField", oldValue: "x", newValue: null },
    ]);
  });

  it("treats null and undefined before/after as an empty object", () => {
    expect(diffToFields(null, { hp: 10 })).toEqual([
      { path: "hp", oldValue: null, newValue: 10 },
    ]);
    expect(diffToFields({ hp: 10 }, undefined)).toEqual([
      { path: "hp", oldValue: 10, newValue: null },
    ]);
  });

  it("returns an empty array when nothing changed", () => {
    expect(diffToFields({ hp: 10 }, { hp: 10 })).toEqual([]);
  });

  it("treats a value replaced by a primitive as an atomic change (no recursion)", () => {
    expect(diffToFields({ effect: { on: true } }, { effect: 3 })).toEqual([
      { path: "effect", oldValue: { on: true }, newValue: 3 },
    ]);
  });

  it("treats an object replaced by null as an atomic change", () => {
    expect(diffToFields({ effect: { on: true } }, { effect: null })).toEqual([
      { path: "effect", oldValue: { on: true }, newValue: null },
    ]);
    expect(diffToFields({ effect: null }, { effect: { on: true } })).toEqual([
      { path: "effect", oldValue: null, newValue: { on: true } },
    ]);
  });

  it("recurses through multiple levels of nesting", () => {
    expect(
      diffToFields(
        { a: { b: { c: 1, d: 2 } } },
        { a: { b: { c: 9, d: 2 } } },
      ),
    ).toEqual([{ path: "a.b.c", oldValue: 1, newValue: 9 }]);
  });
});
