import { forwardRef, type InputHTMLAttributes } from "react";

// Shared by Textarea/Select/DiceInput; text-parchment-900 keeps text legible in dark mode.
const controlBase =
  "min-w-0 box-border rounded-control border border-parchment-300 bg-parchment-50 px-2.5 py-1.5 text-sm text-parchment-900 placeholder:text-parchment-400 focus:border-garnet-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-garnet-600";
export const controlClass = `w-full ${controlBase}`;

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  fullWidth?: boolean;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className = "", fullWidth = true, ...props }, ref) => (
    <input ref={ref} className={`${fullWidth ? controlClass : controlBase} ${className}`} {...props} />
  ),
);
Input.displayName = "Input";

export default Input;
