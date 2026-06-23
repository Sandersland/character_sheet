import { useEffect, useState } from "react";

import { checkHealth } from "@/api/client";

/**
 * Keeps the backend connectivity proof-of-life visible (per CLAUDE.md,
 * don't rip it out) without giving it any real estate — a small dot +
 * label tucked in page chrome, not a banner.
 */
export default function BackendStatus() {
  const [status, setStatus] = useState<"checking" | "ok" | "down">(
    "checking"
  );

  useEffect(() => {
    let mounted = true;
    checkHealth().then((ok) => {
      if (mounted) setStatus(ok ? "ok" : "down");
    });
    return () => {
      mounted = false;
    };
  }, []);

  const dotColor =
    status === "ok"
      ? "bg-vitality-500"
      : status === "down"
        ? "bg-garnet-500"
        : "bg-parchment-400";

  const label =
    status === "ok"
      ? "Backend connected"
      : status === "down"
        ? "Backend unreachable"
        : "Checking backend…";

  // The healthy state stays a quiet dot-only proof-of-life (the label is
  // preserved for screen readers / hover via aria-label + title); only the
  // problem states get visible prose so they actually draw the eye.
  const showText = status !== "ok";

  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs text-parchment-500"
      role="status"
      aria-label={label}
      title={label}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${dotColor}`}
        aria-hidden="true"
      />
      {showText && label}
    </span>
  );
}
