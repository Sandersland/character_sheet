import type { ReactNode } from "react";

import { TriangleAlert } from "@/components/ui/icons";

interface GoldWarningBoxProps {
  children: ReactNode;
}

// The gold "heads up" box shared by every combine-preview warning (#1943's
// CombineConfirmDialog, #1946's ReviewDuplicatesModal): lost content,
// redacted mentions, an inherited item link, a dropped prepared merge — one
// visual language instead of two hand-kept copies. No D&D knowledge lives
// here; callers own what goes in `children`.
export default function GoldWarningBox({ children }: GoldWarningBoxProps) {
  return (
    <div className="flex items-start gap-2 rounded-card border border-gold-400 bg-gold-100 px-3 py-2.5 text-xs font-medium text-gold-900">
      <TriangleAlert aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
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

// The itemized "what's lost" variant of GoldWarningBox: renders nothing when
// `items` is empty, so callers don't need their own length check.
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
