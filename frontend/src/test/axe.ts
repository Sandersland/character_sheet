import { axe } from "jest-axe";
import "vitest";

// Re-export axe so component tests import the runtime a11y checker from one place.
// The matcher itself (`toHaveNoViolations`) is registered globally in setup.ts.
export { axe };

interface AxeMatchers<R = unknown> {
  toHaveNoViolations(): R;
}

// Module augmentation: the empty extending interfaces and the `any` default must
// match vitest's own `Assertion<T = any>` signature exactly, so the lint rules
// that would normally flag them don't apply here.
declare module "vitest" {
  /* eslint-disable @typescript-eslint/no-empty-object-type, @typescript-eslint/no-explicit-any -- empty interfaces + `any` default must mirror vitest's own Assertion<T = any> signature exactly */
  interface Assertion<T = any> extends AxeMatchers<T> {}
  interface AsymmetricMatchersContaining extends AxeMatchers {}
  /* eslint-enable @typescript-eslint/no-empty-object-type, @typescript-eslint/no-explicit-any -- re-enable after the vitest matcher augmentation */
}
