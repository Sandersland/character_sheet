import { forwardRef, type InputHTMLAttributes } from "react";

// Shared token-styled control surface, reused by Textarea/Select/DiceInput.
// Explicit text-parchment-900 keeps numeric input legible in dark mode.
export const controlClass =
  "w-full min-w-0 box-border rounded-control border border-parchment-300 bg-parchment-50 px-2.5 py-1.5 text-sm text-parchment-900 placeholder:text-parchment-400 focus:border-garnet-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-garnet-600";

const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className = "", ...props }, ref) => (
    <input ref={ref} className={`${controlClass} ${className}`} {...props} />
  ),
);
Input.displayName = "Input";

export default Input;
