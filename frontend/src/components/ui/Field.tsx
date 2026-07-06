import type { ReactNode } from "react";

interface FieldProps {
  label: string;
  htmlFor?: string;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  className?: string;
  children: ReactNode;
}

// Label + control + hint/error wrapper. Error takes precedence over hint.
export default function Field({ label, htmlFor, hint, error, required, className = "", children }: FieldProps) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label htmlFor={htmlFor} className="text-xs font-semibold text-parchment-700">
        {label}
        {required && (
          <span aria-hidden="true" className="text-garnet-600">
            {" *"}
          </span>
        )}
      </label>
      {children}
      {error ? (
        <p className="text-xs font-semibold text-garnet-700">{error}</p>
      ) : hint ? (
        <p className="text-xs text-parchment-500">{hint}</p>
      ) : null}
    </div>
  );
}
