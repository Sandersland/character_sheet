/**
 * JournalDoorway — the sheet's journal card (#867). The journal now lives on its
 * own page (/characters/:id/journal, #864); the sheet keeps just a doorway: a
 * CSS-drawn closed book (garnet cover + gilt frame) captioned with the current
 * chapter, note/chapter counts, and when it was last written. The whole card is a
 * link to the chronicle page — there is NO add/edit/delete surface on the sheet
 * anymore (⌘J quick capture covers in-the-moment jots).
 *
 * Data comes from the live character.journal + the chronicle sessions (useChronicle),
 * distilled by summarizeJournalDoorway — no new backend.
 */

import { useMemo } from "react";
import { Link } from "react-router-dom";

import { summarizeJournalDoorway } from "@/features/journal/journalDoorwaySummary";
import { useChronicle } from "@/features/journal/useChronicle";
import { formatRelativeDay } from "@/lib/formatJournalDate";
import type { Character } from "@/types/character";

// The closed book must read as a dark-red tome in BOTH themes, so its cover, spine
// and gilt use fixed hex (the garnet-*/gold-* tokens invert in dark mode). Values
// track the light-mode garnet-800 / garnet-900 / gold-600 tokens.
const COVER = "#8a041a";
const SPINE = "#610316";
const GILT = "#c99a2e";

function ClosedBook() {
  return (
    <div
      aria-hidden="true"
      className="relative h-[4.75rem] w-14 shrink-0 self-start rounded-l-[3px] rounded-r-md shadow-raised"
      style={{ background: `linear-gradient(135deg, ${COVER}, ${SPINE})` }}
    >
      {/* Darker spine strip down the binding edge. */}
      <div className="absolute inset-y-0 left-0 w-2 rounded-l-[3px]" style={{ background: SPINE }} />
      {/* Inset gold hairline frame, clearing the spine on the left. */}
      <div
        className="absolute inset-y-2 left-[0.875rem] right-2 rounded-[2px] border"
        style={{ borderColor: GILT }}
      />
      {/* Centered gold diamond. */}
      <div
        className="absolute left-[calc(50%+0.25rem)] top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45"
        style={{ backgroundColor: GILT }}
      />
    </div>
  );
}

export default function JournalDoorway({ character }: { character: Character }) {
  const { sessions } = useChronicle(character);
  const summary = useMemo(
    () => summarizeJournalDoorway(character.journal, sessions),
    [character.journal, sessions],
  );

  const title = summary.isEmpty
    ? "Begin your chronicle"
    : summary.currentChapterTitle ?? "Between sessions";

  let subtitle: string;
  if (summary.isEmpty) {
    subtitle = "Your first note opens the book.";
  } else {
    const parts = [`${summary.noteCount} ${summary.noteCount === 1 ? "note" : "notes"}`];
    if (summary.chapterCount > 0) {
      parts.push(`${summary.chapterCount} ${summary.chapterCount === 1 ? "chapter" : "chapters"}`);
    }
    if (summary.lastWrittenAt) {
      parts.push(`last written ${formatRelativeDay(summary.lastWrittenAt)}`);
    }
    subtitle = parts.join(" · ");
  }

  return (
    <Link
      to={`/characters/${character.id}/journal`}
      aria-label={`Open journal — ${title}`}
      className="surface-grain group flex items-center gap-4 rounded-card border border-parchment-200 bg-parchment-50 p-4 shadow-card transition hover:border-garnet-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-garnet-600"
    >
      <ClosedBook />
      <div className="min-w-0 flex-1">
        <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.18em] text-gold-700">
          Journal
        </p>
        <p className="truncate font-display text-lg font-semibold text-parchment-900">{title}</p>
        <p className="mt-0.5 truncate text-xs text-parchment-600">{subtitle}</p>
      </div>
      <span className="shrink-0 self-center whitespace-nowrap text-sm font-semibold text-garnet-700 group-hover:underline">
        Open ›
      </span>
    </Link>
  );
}
