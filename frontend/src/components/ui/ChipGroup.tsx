import type { ReactNode } from "react";

interface ChipGroupProps {
  label?: string;
  children: ReactNode;
  className?: string;
}

export default function ChipGroup({ label, children, className = "" }: ChipGroupProps) {
  return (
    <div role="group" aria-label={label} className={`flex flex-wrap gap-2 ${className}`}>
      {children}
    </div>
  );
}
