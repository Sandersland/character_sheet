import type { InboxDiscardedItem } from "@/lib/inboxCombinePreview";

interface DiscardedBoxProps {
  items: InboxDiscardedItem[];
}

// The gold "Discarded" warning box (#1946), matching #1943's
// CombineConfirmDialog treatment. Renders nothing when there's nothing to
// discard — the caller doesn't need to check items.length itself.
export default function DiscardedBox({ items }: DiscardedBoxProps) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 rounded-card border border-gold-400 bg-gold-100 px-3 py-2.5">
      <p className="text-xs font-bold text-gold-900">Discarded</p>
      <ul className="flex flex-col gap-1 text-xs font-medium text-gold-800">
        {items.map((item) => (
          <li key={item.key}>{item.label}</li>
        ))}
      </ul>
    </div>
  );
}
