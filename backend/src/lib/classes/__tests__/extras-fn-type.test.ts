// Compile-time pin (#1317): ExtrasFn admits ClassExtras fields and nothing
// else — this is what closes the #1276 escape hatch. No runtime assertion is
// possible for a type constraint, so the bodies exist only to make
// `npm run typecheck` fail without the narrowing and pass with it.
import { describe, it } from "vitest";

import type { DerivedClassInfo, ExtrasFn } from "@/lib/classes/types.js";

describe("ExtrasFn return type", () => {
  it("rejects an arbitrary DerivedClassInfo field returned as a literal", () => {
    // @ts-expect-error -- subclassChoices is a DerivedClassInfo field, not a ClassExtras field; ExtrasFn must reject it
    const fn: ExtrasFn = () => ({ subclassChoices: [] as DerivedClassInfo["subclassChoices"] });
    void fn;
  });

  // Partial<ClassExtras> alone would pass all three of these: the
  // excess-property check only fires on a fresh literal in return position,
  // and `const out = {…}; return out` is an ordinary way to write a
  // deriveExtras. The Record<…, never> half of ClassExtrasOnly is what fails
  // them, and these are the cases that make it load-bearing rather than
  // decorative.
  it("rejects fields smuggled past the excess-property check", () => {
    // @ts-expect-error -- widening through a const strips the literal check; the never-typed keys must still reject it
    const viaConst: ExtrasFn = () => {
      const out = {
        maneuverChoiceCount: 1,
        subclassChoices: [] as DerivedClassInfo["subclassChoices"],
      };
      return out;
    };
    // @ts-expect-error -- a whole DerivedClassInfo would clobber resources/features on the overlay accumulator
    const viaWholeShape: ExtrasFn = (): DerivedClassInfo => ({ resources: [], features: [] });
    void viaConst;
    void viaWholeShape;
  });
});
