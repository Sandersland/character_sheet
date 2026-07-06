import { useId, useState, type ReactNode } from "react";

import { ChevronDown } from "@/components/ui/icons";

interface DisclosureProps {
  summary: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}

// Collapsible section: a disclosure button (aria-expanded/-controls) + region.
export default function Disclosure({ summary, children, defaultOpen = false, className = "" }: DisclosureProps) {
  const [open, setOpen] = useState(defaultOpen);
  const regionId = useId();
  return (
    <div className={className}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={regionId}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 rounded-control text-xs font-semibold text-parchment-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-garnet-600"
      >
        <ChevronDown
          aria-hidden="true"
          className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
        />
        {summary}
      </button>
      {open && (
        <div id={regionId} className="mt-2">
          {children}
        </div>
      )}
    </div>
  );
}
