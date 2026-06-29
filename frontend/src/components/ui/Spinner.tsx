interface SpinnerProps {
  /** "page" centers a larger spinner in a full-screen container; "inline" is a
   *  small spinner centered within its parent block. */
  variant?: "page" | "inline";
  className?: string;
}

// Shared loading spinner. Pair with `useDelayedFlag` so it only ever appears
// for genuinely slow loads — fast loads should render nothing at all.
export default function Spinner({ variant = "inline", className }: SpinnerProps) {
  const page = variant === "page";
  const wrapper = page
    ? "flex min-h-screen items-center justify-center bg-parchment-100"
    : "flex items-center justify-center py-4";

  return (
    <div
      role="status"
      className={`${wrapper}${className ? ` ${className}` : ""}`}
    >
      <span
        aria-hidden="true"
        className={`animate-spin rounded-full border-parchment-300 border-t-garnet-700 ${
          page ? "h-8 w-8 border-4" : "h-5 w-5 border-2"
        }`}
      />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
