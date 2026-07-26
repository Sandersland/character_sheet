// Compile-time pin (#1317): ExtrasFn returns Partial<ClassExtras> only, never
// an arbitrary DerivedClassInfo field — this is what closes the #1276 escape
// hatch. No runtime assertion is possible for a type constraint, so the test
// body's only job is to make `npm run typecheck` fail without the narrowing
// and pass with it; `subclassChoices` is a real DerivedClassInfo field a
// pre-#1317 ExtrasFn could return but a ClassExtras-scoped one cannot.
import { describe, it } from "vitest";

import type { DerivedClassInfo, ExtrasFn } from "@/lib/classes/types.js";

describe("ExtrasFn return type", () => {
  it("cannot return an arbitrary DerivedClassInfo field outside ClassExtras", () => {
    // @ts-expect-error -- subclassChoices is a DerivedClassInfo field, not a ClassExtras field; ExtrasFn must reject it
    const fn: ExtrasFn = () => ({ subclassChoices: [] as DerivedClassInfo["subclassChoices"] });
    void fn;
  });
});
