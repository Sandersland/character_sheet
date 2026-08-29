import { useEffect, useState } from "react";

import { checkHealth } from "@/api/client";

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

  if (status !== "down") return null;

  const label = "Backend unreachable";

  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs text-garnet-700"
      role="status"
      aria-label={label}
      title={label}
    >
      <span
        className="h-1.5 w-1.5 rounded-full bg-garnet-500"
        aria-hidden="true"
      />
      {label}
    </span>
  );
}
