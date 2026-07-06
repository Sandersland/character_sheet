import { forwardRef, type InputHTMLAttributes } from "react";

// Shared token-styled control surface, reused by Textarea/Select/DiceInput.
// Explicit text-parchment-900 keeps numeric input legible in dark mode.
const controlBase =
  "min-w-0 box-border rounded-control border border-parchment-300 bg-parchment-50 px-2.5 py-1.5 text-sm text-parchment-900 placeholder:text-parchment-400 focus:border-garnet-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-garnet-600";
export const controlClass = `w-full ${controlBase}`;

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  // Opt out of w-full so a caller can size the control narrowly (e.g. DiceInput).
  fullWidth?: boolean;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className = "", fullWidth = true, ...props }, ref) => (
    <input ref={ref} className={`${fullWidth ? controlClass : controlBase} ${className}`} {...props} />
  ),
);
Input.displayName = "Input";

export default Input;
