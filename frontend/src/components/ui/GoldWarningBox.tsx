import type { ReactNode } from "react";

import { TriangleAlert } from "@/components/ui/icons";

interface GoldWarningBoxProps {
  icon?: ReactNode;
  variant?: "callout" | "row";
  children: ReactNode;
}

export default function GoldWarningBox({ icon, variant = "callout", children }: GoldWarningBoxProps) {
  if (variant === "row") {
    return (
      <div className="flex items-center gap-2.5 rounded-card border border-gold-400 bg-gold-100 px-3 py-2">
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-control bg-gold-400 text-gold-900"
          aria-hidden="true"
        >
          {icon ?? <TriangleAlert className="h-3.5 w-3.5" />}
        </span>
        <div className="min-w-0">{children}</div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2 rounded-card border border-gold-400 bg-gold-100 px-3 py-2.5 text-xs font-medium text-gold-900">
      {icon ?? <TriangleAlert aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  );
}

interface GoldWarningListItem {
  key: string;
  label: string;
}

interface DiscardedItemsBoxProps {
  heading: ReactNode;
  items: GoldWarningListItem[];
}

export function DiscardedItemsBox({ heading, items }: DiscardedItemsBoxProps) {
  if (items.length === 0) return null;
  return (
    <GoldWarningBox>
      <div className="font-bold">{heading}</div>
      <ul className="flex flex-col gap-1">
        {items.map((item) => (
          <li key={item.key}>{item.label}</li>
        ))}
      </ul>
    </GoldWarningBox>
  );
}
