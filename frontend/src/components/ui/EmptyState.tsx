import type { ReactNode } from "react";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  size?: "sm" | "md";
  className?: string;
}

// Shared warm empty-state: decorative hero + display title + optional prompt/CTA.
export default function EmptyState({
  icon,
  title,
  description,
  action,
  size = "md",
  className,
}: EmptyStateProps) {
  const md = size === "md";
  return (
    <div
      className={`flex flex-col items-center text-center ${
        md ? "gap-2 px-6 py-10" : "gap-1.5 py-6"
      }${className ? ` ${className}` : ""}`}
    >
      {icon && (
        <span
          aria-hidden="true"
          className={`mb-1 flex items-center justify-center rounded-full bg-parchment-100 text-parchment-400 ${
            md ? "h-12 w-12 text-2xl" : "h-9 w-9 text-lg"
          }`}
        >
          {icon}
        </span>
      )}
      <p
        className={`font-display font-semibold text-parchment-800 ${
          md ? "text-base" : "text-sm"
        }`}
      >
        {title}
      </p>
      {description && (
        <p className="max-w-xs text-sm text-parchment-600">{description}</p>
      )}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-2 rounded-control bg-garnet-700 px-4 py-2 text-sm font-semibold text-parchment-50 transition-colors hover:bg-garnet-800 focus-visible:bg-garnet-800"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
