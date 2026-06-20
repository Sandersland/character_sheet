import type { JournalEntry } from "@/types/character";

interface JournalSectionProps {
  entries: JournalEntry[];
}

export default function JournalSection({ entries }: JournalSectionProps) {
  if (entries.length === 0) {
    return (
      <p className="px-4 py-6 text-center text-sm text-parchment-500">
        No journal entries yet. Notes from your sessions will show up here.
      </p>
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-parchment-200">
      {entries.map((entry) => (
        <li key={entry.id} className="py-3">
          <div className="flex items-baseline justify-between gap-2">
            <p className="font-display text-base font-semibold text-parchment-900">
              {entry.title}
            </p>
            <span className="whitespace-nowrap text-xs text-parchment-500">
              {entry.date}
            </span>
          </div>
          <p className="mt-1 text-sm text-parchment-700">
            {entry.body}
          </p>
        </li>
      ))}
    </ul>
  );
}
