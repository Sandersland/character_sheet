import { axe } from "jest-axe";
import "vitest";

// toHaveNoViolations itself is registered globally via expect.extend, not here.
export { axe };

interface AxeMatchers<R = unknown> {
  toHaveNoViolations(): R;
}

declare module "vitest" {
  /* eslint-disable @typescript-eslint/no-empty-object-type, @typescript-eslint/no-explicit-any -- empty interfaces + `any` default must mirror vitest's own Assertion<T = any> signature exactly */
  interface Assertion<T = any> extends AxeMatchers<T> {}
  interface AsymmetricMatchersContaining extends AxeMatchers {}
  /* eslint-enable @typescript-eslint/no-empty-object-type, @typescript-eslint/no-explicit-any -- re-enable after the vitest matcher augmentation */
}
